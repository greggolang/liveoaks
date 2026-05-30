package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type ContactsHandler struct {
	DB *pgxpool.Pool
}

type Contact struct {
	ID        string    `json:"id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     *string   `json:"email,omitempty"`
	Phone     *string   `json:"phone,omitempty"`
	Category  string    `json:"category"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *ContactsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, phone, category, notes, created_at
		 FROM contacts ORDER BY last_name, first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch contacts")
	}
	defer rows.Close()

	contacts := []Contact{}
	for rows.Next() {
		var ct Contact
		if err := rows.Scan(&ct.ID, &ct.FirstName, &ct.LastName, &ct.Email, &ct.Phone, &ct.Category, &ct.Notes, &ct.CreatedAt); err != nil {
			continue
		}
		contacts = append(contacts, ct)
	}
	return c.JSON(http.StatusOK, contacts)
}

func (h *ContactsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
		Category  string `json:"category"`
		Notes     string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	if req.Category == "" {
		req.Category = "other"
	}
	var ct Contact
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO contacts (first_name, last_name, email, phone, category, notes, created_by)
		 VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), $5, NULLIF($6,''), $7)
		 RETURNING id, first_name, last_name, email, phone, category, notes, created_at`,
		req.FirstName, req.LastName, req.Email, req.Phone, req.Category, req.Notes, userID,
	).Scan(&ct.ID, &ct.FirstName, &ct.LastName, &ct.Email, &ct.Phone, &ct.Category, &ct.Notes, &ct.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create contact")
	}
	return c.JSON(http.StatusCreated, ct)
}

func (h *ContactsHandler) Update(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
		Category  string `json:"category"`
		Notes     string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE contacts SET first_name=$1, last_name=$2, email=NULLIF($3,''),
		 phone=NULLIF($4,''), category=$5, notes=NULLIF($6,''), updated_at=NOW()
		 WHERE id=$7`,
		req.FirstName, req.LastName, req.Email, req.Phone, req.Category, req.Notes, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update contact")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *ContactsHandler) Delete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM contacts WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
