package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type MailContactsHandler struct {
	DB *pgxpool.Pool
}

type MailContact struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Phone     *string   `json:"phone,omitempty"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (h *MailContactsHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, user_id, name, email, phone, notes, created_at, updated_at
		 FROM mail_contacts WHERE user_id = $1 ORDER BY name`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch contacts")
	}
	defer rows.Close()
	contacts := []MailContact{}
	for rows.Next() {
		var ct MailContact
		if err := rows.Scan(&ct.ID, &ct.UserID, &ct.Name, &ct.Email, &ct.Phone, &ct.Notes, &ct.CreatedAt, &ct.UpdatedAt); err != nil {
			continue
		}
		contacts = append(contacts, ct)
	}
	return c.JSON(http.StatusOK, contacts)
}

func (h *MailContactsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
		Notes string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and email are required")
	}
	var ct MailContact
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO mail_contacts (user_id, name, email, phone, notes)
		 VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''))
		 RETURNING id, user_id, name, email, phone, notes, created_at, updated_at`,
		userID, req.Name, req.Email, req.Phone, req.Notes,
	).Scan(&ct.ID, &ct.UserID, &ct.Name, &ct.Email, &ct.Phone, &ct.Notes, &ct.CreatedAt, &ct.UpdatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create contact")
	}
	return c.JSON(http.StatusCreated, ct)
}

func (h *MailContactsHandler) Update(c echo.Context) error {
	userID := c.Get("user_id").(string)
	id := c.Param("id")
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
		Notes string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and email are required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE mail_contacts SET name=$1, email=$2, phone=NULLIF($3,''), notes=NULLIF($4,''), updated_at=NOW()
		 WHERE id=$5 AND user_id=$6`,
		req.Name, req.Email, req.Phone, req.Notes, id, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update contact")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *MailContactsHandler) Delete(c echo.Context) error {
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM mail_contacts WHERE id=$1 AND user_id=$2`, c.Param("id"), userID)
	return c.NoContent(http.StatusNoContent)
}
