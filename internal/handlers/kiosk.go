package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type KioskHandler struct {
	DB *pgxpool.Pool
}

// Members returns the public member list for the kiosk name-picker.
// Only id, name, and member_number are exposed — no email or contact info.
func (h *KioskHandler) Members(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, first_name || ' ' || last_name, member_number
		FROM users
		WHERE status = 'active'
		ORDER BY last_name, first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch members")
	}
	defer rows.Close()

	type KioskMember struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		MemberNumber int    `json:"member_number"`
	}
	members := []KioskMember{}
	for rows.Next() {
		var m KioskMember
		if err := rows.Scan(&m.ID, &m.Name, &m.MemberNumber); err != nil {
			continue
		}
		members = append(members, m)
	}
	return c.JSON(http.StatusOK, members)
}

// Purchase records one or more kiosk pro-shop purchases against a member's account.
func (h *KioskHandler) Purchase(c echo.Context) error {
	var req struct {
		UserID string `json:"user_id"`
		Items  []struct {
			ItemID   string  `json:"item_id"`
			ItemName string  `json:"item_name"`
			Price    float64 `json:"price"`
			Quantity int     `json:"quantity"`
		} `json:"items"`
		Notes string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || len(req.Items) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and at least one item are required")
	}

	// Verify the member exists and is active.
	var memberName string
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name || ' ' || last_name FROM users WHERE id = $1 AND status = 'active'`,
		req.UserID).Scan(&memberName); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "member not found")
	}

	type PurchaseRecord struct {
		ID        string    `json:"id"`
		ItemName  string    `json:"item_name"`
		Price     float64   `json:"price"`
		Quantity  int       `json:"quantity"`
		Total     float64   `json:"total"`
		CreatedAt time.Time `json:"created_at"`
	}
	results := []PurchaseRecord{}

	for _, item := range req.Items {
		if item.Quantity <= 0 {
			item.Quantity = 1
		}
		total := item.Price * float64(item.Quantity)

		var itemIDParam interface{}
		if item.ItemID != "" {
			itemIDParam = item.ItemID
		}

		var pr PurchaseRecord
		err := h.DB.QueryRow(c.Request().Context(), `
			INSERT INTO pro_shop_purchases (user_id, item_id, item_name, item_price, quantity, total, notes)
			VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7,''))
			RETURNING id, item_name, item_price, quantity, total, created_at`,
			req.UserID, itemIDParam, item.ItemName, item.Price, item.Quantity, total, req.Notes,
		).Scan(&pr.ID, &pr.ItemName, &pr.Price, &pr.Quantity, &pr.Total, &pr.CreatedAt)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not record purchase")
		}
		results = append(results, pr)
	}

	grandTotal := 0.0
	for _, r := range results {
		grandTotal += r.Total
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"member_name": memberName,
		"purchases":   results,
		"grand_total": grandTotal,
	})
}

// AdminPurchaseList returns all pro-shop kiosk purchases, optionally filtered by user.
func (h *KioskHandler) AdminPurchaseList(c echo.Context) error {
	userID := c.QueryParam("user_id")

	var rows interface {
		Next() bool
		Close()
		Scan(...interface{}) error
	}
	var err error

	if userID != "" {
		rows, err = h.DB.Query(c.Request().Context(), `
			SELECT p.id, p.user_id, u.first_name||' '||u.last_name,
			       p.item_name, p.item_price::float8, p.quantity, p.total::float8,
			       p.notes, p.created_at
			FROM pro_shop_purchases p
			JOIN users u ON u.id = p.user_id
			WHERE p.user_id = $1
			ORDER BY p.created_at DESC`, userID)
	} else {
		rows, err = h.DB.Query(c.Request().Context(), `
			SELECT p.id, p.user_id, u.first_name||' '||u.last_name,
			       p.item_name, p.item_price::float8, p.quantity, p.total::float8,
			       p.notes, p.created_at
			FROM pro_shop_purchases p
			JOIN users u ON u.id = p.user_id
			ORDER BY p.created_at DESC
			LIMIT 500`)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch purchases")
	}
	defer rows.Close()

	type Purchase struct {
		ID         string    `json:"id"`
		UserID     string    `json:"user_id"`
		MemberName string    `json:"member_name"`
		ItemName   string    `json:"item_name"`
		ItemPrice  float64   `json:"item_price"`
		Quantity   int       `json:"quantity"`
		Total      float64   `json:"total"`
		Notes      *string   `json:"notes,omitempty"`
		CreatedAt  time.Time `json:"created_at"`
	}
	purchases := []Purchase{}
	for rows.Next() {
		var p Purchase
		if err := rows.Scan(&p.ID, &p.UserID, &p.MemberName,
			&p.ItemName, &p.ItemPrice, &p.Quantity, &p.Total,
			&p.Notes, &p.CreatedAt); err != nil {
			continue
		}
		purchases = append(purchases, p)
	}
	return c.JSON(http.StatusOK, purchases)
}

// UpdatePurchase allows an admin to correct a kiosk purchase record.
func (h *KioskHandler) UpdatePurchase(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		ItemName  string  `json:"item_name"`
		ItemPrice float64 `json:"item_price"`
		Quantity  int     `json:"quantity"`
		Notes     string  `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.ItemName == "" || req.Quantity < 1 {
		return echo.NewHTTPError(http.StatusBadRequest, "item_name and quantity required")
	}
	total := req.ItemPrice * float64(req.Quantity)
	_, err := h.DB.Exec(c.Request().Context(), `
		UPDATE pro_shop_purchases
		SET item_name=$1, item_price=$2, quantity=$3, total=$4, notes=NULLIF($5,'')
		WHERE id=$6`,
		req.ItemName, req.ItemPrice, req.Quantity, total, req.Notes, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update purchase")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"id": id, "item_name": req.ItemName, "item_price": req.ItemPrice,
		"quantity": req.Quantity, "total": total, "notes": req.Notes,
	})
}

// DeletePurchase removes a kiosk purchase record.
func (h *KioskHandler) DeletePurchase(c echo.Context) error {
	_, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM pro_shop_purchases WHERE id=$1`, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete purchase")
	}
	return c.NoContent(http.StatusNoContent)
}
