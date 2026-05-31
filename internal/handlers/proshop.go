package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type ProShopHandler struct {
	DB *pgxpool.Pool
}

type ProShopItem struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	Category    string    `json:"category"`
	Emoji       string    `json:"emoji"`
	InStock     bool      `json:"in_stock"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
}

func (h *ProShopHandler) scan(rows interface {
	Scan(...any) error
}) (ProShopItem, error) {
	var p ProShopItem
	err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.Emoji, &p.InStock, &p.SortOrder, &p.CreatedAt)
	return p, err
}

const proShopSelect = `SELECT id, name, description, price::float8, category, emoji, in_stock, sort_order, created_at FROM pro_shop_items`

// List returns in-stock items for members.
func (h *ProShopHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		proShopSelect+` WHERE in_stock = TRUE ORDER BY category, sort_order, name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch items")
	}
	defer rows.Close()
	items := []ProShopItem{}
	for rows.Next() {
		p, err := h.scan(rows)
		if err == nil {
			items = append(items, p)
		}
	}
	return c.JSON(http.StatusOK, items)
}

// AdminList returns all items (including out-of-stock) for admins.
func (h *ProShopHandler) AdminList(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		proShopSelect+` ORDER BY category, sort_order, name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch items")
	}
	defer rows.Close()
	items := []ProShopItem{}
	for rows.Next() {
		p, err := h.scan(rows)
		if err == nil {
			items = append(items, p)
		}
	}
	return c.JSON(http.StatusOK, items)
}

// Create adds a new item.
func (h *ProShopHandler) Create(c echo.Context) error {
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
		Category    string  `json:"category"`
		Emoji       string  `json:"emoji"`
		SortOrder   int     `json:"sort_order"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	if req.Emoji == "" {
		req.Emoji = "🛍️"
	}
	if req.Category == "" {
		req.Category = "other"
	}
	var p ProShopItem
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO pro_shop_items (name, description, price, category, emoji, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, name, description, price::float8, category, emoji, in_stock, sort_order, created_at`,
		req.Name, req.Description, req.Price, req.Category, req.Emoji, req.SortOrder,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.Emoji, &p.InStock, &p.SortOrder, &p.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create item")
	}
	return c.JSON(http.StatusCreated, p)
}

// Update edits an existing item.
func (h *ProShopHandler) Update(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
		Category    string  `json:"category"`
		Emoji       string  `json:"emoji"`
		InStock     bool    `json:"in_stock"`
		SortOrder   int     `json:"sort_order"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	_, err := h.DB.Exec(c.Request().Context(), `
		UPDATE pro_shop_items
		SET name=$1, description=$2, price=$3, category=$4, emoji=$5, in_stock=$6, sort_order=$7
		WHERE id=$8`,
		req.Name, req.Description, req.Price, req.Category, req.Emoji, req.InStock, req.SortOrder, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update item")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

// Delete removes an item permanently.
func (h *ProShopHandler) Delete(c echo.Context) error {
	_, err := h.DB.Exec(c.Request().Context(), `DELETE FROM pro_shop_items WHERE id=$1`, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete item")
	}
	return c.NoContent(http.StatusNoContent)
}
