package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type WaitlistHandler struct {
	DB *pgxpool.Pool
}

type WaitlistEntry struct {
	ID        string    `json:"id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     *string   `json:"email,omitempty"`
	Phone     *string   `json:"phone,omitempty"`
	Notes     *string   `json:"notes,omitempty"`
	Status    string    `json:"status"`
	Position  *int      `json:"position,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *WaitlistHandler) Join(c echo.Context) error {
	var req struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
		Notes     string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO waitlist (first_name, last_name, email, phone, notes)
		 VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''))`,
		req.FirstName, req.LastName, req.Email, req.Phone, req.Notes)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "already on the waitlist")
	}
	return c.JSON(http.StatusCreated, map[string]string{"message": "Added to waitlist. We'll contact you when a spot opens."})
}

func (h *WaitlistHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, phone, notes, status, position, created_at
		 FROM waitlist
		 ORDER BY COALESCE(position, 99999), created_at ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch waitlist")
	}
	defer rows.Close()

	entries := []WaitlistEntry{}
	for rows.Next() {
		var w WaitlistEntry
		if err := rows.Scan(&w.ID, &w.FirstName, &w.LastName, &w.Email, &w.Phone,
			&w.Notes, &w.Status, &w.Position, &w.CreatedAt); err != nil {
			continue
		}
		entries = append(entries, w)
	}
	return c.JSON(http.StatusOK, entries)
}

func (h *WaitlistHandler) UpdateStatus(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	h.DB.Exec(c.Request().Context(), `UPDATE waitlist SET status = $1 WHERE id = $2`, body.Status, id)
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *WaitlistHandler) UpdateContact(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Email string `json:"email"`
		Phone string `json:"phone"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE waitlist SET email = NULLIF($1,''), phone = NULLIF($2,'') WHERE id = $3`,
		body.Email, body.Phone, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update contact")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *WaitlistHandler) Delete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM waitlist WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
