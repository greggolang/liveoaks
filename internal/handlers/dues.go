package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type DuesHandler struct {
	DB *pgxpool.Pool
}

type Due struct {
	ID        string     `json:"id"`
	UserID    string     `json:"user_id"`
	Amount    float64    `json:"amount"`
	DueDate   time.Time  `json:"due_date"`
	PaidAt    *time.Time `json:"paid_at,omitempty"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	FirstName string     `json:"first_name,omitempty"`
	LastName  string     `json:"last_name,omitempty"`
	Email     string     `json:"email,omitempty"`
}

func (h *DuesHandler) AdminList(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT d.id, d.user_id, d.amount, d.due_date, d.paid_at, d.status, d.created_at,
		        u.first_name, u.last_name, u.email
		 FROM dues d JOIN users u ON u.id = d.user_id
		 ORDER BY d.due_date DESC, u.last_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch dues")
	}
	defer rows.Close()

	dues := []Due{}
	for rows.Next() {
		var d Due
		if err := rows.Scan(&d.ID, &d.UserID, &d.Amount, &d.DueDate, &d.PaidAt, &d.Status,
			&d.CreatedAt, &d.FirstName, &d.LastName, &d.Email); err != nil {
			continue
		}
		dues = append(dues, d)
	}
	return c.JSON(http.StatusOK, dues)
}

func (h *DuesHandler) MyDues(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, user_id, amount, due_date, paid_at, status, created_at
		 FROM dues WHERE user_id = $1 ORDER BY due_date DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch dues")
	}
	defer rows.Close()

	dues := []Due{}
	for rows.Next() {
		var d Due
		if err := rows.Scan(&d.ID, &d.UserID, &d.Amount, &d.DueDate, &d.PaidAt, &d.Status, &d.CreatedAt); err != nil {
			continue
		}
		dues = append(dues, d)
	}
	return c.JSON(http.StatusOK, dues)
}

func (h *DuesHandler) UpdateStatus(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Status string  `json:"status"`
		Amount float64 `json:"amount"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	var paidAt *string
	if body.Status == "paid" {
		now := "NOW()"
		paidAt = &now
	}
	if paidAt != nil {
		h.DB.Exec(c.Request().Context(),
			`UPDATE dues SET status = $1, paid_at = NOW() WHERE id = $2`, body.Status, id)
	} else {
		h.DB.Exec(c.Request().Context(),
			`UPDATE dues SET status = $1, paid_at = NULL WHERE id = $2`, body.Status, id)
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *DuesHandler) Generate(c echo.Context) error {
	var body struct {
		Amount  float64 `json:"amount"`
		DueDate string  `json:"due_date"`
	}
	if err := c.Bind(&body); err != nil || body.Amount == 0 || body.DueDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "amount and due_date required")
	}
	tag, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO dues (user_id, amount, due_date)
		 SELECT id, $1, $2::date FROM users WHERE status = 'active'
		 ON CONFLICT DO NOTHING`, body.Amount, body.DueDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not generate dues")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"created": tag.RowsAffected()})
}

func (h *DuesHandler) GenerateForUser(c echo.Context) error {
	var body struct {
		UserID  string  `json:"user_id"`
		Amount  float64 `json:"amount"`
		DueDate string  `json:"due_date"`
	}
	if err := c.Bind(&body); err != nil || body.UserID == "" || body.Amount == 0 || body.DueDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id, amount, and due_date required")
	}
	tag, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO dues (user_id, amount, due_date) VALUES ($1, $2, $3::date)
		 ON CONFLICT DO NOTHING`, body.UserID, body.Amount, body.DueDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not generate dues")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"created": tag.RowsAffected()})
}
