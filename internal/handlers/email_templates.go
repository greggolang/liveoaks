package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type EmailTemplatesHandler struct {
	DB *pgxpool.Pool
}

type EmailTemplate struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (h *EmailTemplatesHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, name, subject, body, updated_at FROM email_templates ORDER BY name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch templates")
	}
	defer rows.Close()

	templates := []EmailTemplate{}
	for rows.Next() {
		var t EmailTemplate
		if err := rows.Scan(&t.ID, &t.Name, &t.Subject, &t.Body, &t.UpdatedAt); err != nil {
			continue
		}
		templates = append(templates, t)
	}
	return c.JSON(http.StatusOK, templates)
}

func (h *EmailTemplatesHandler) Create(c echo.Context) error {
	var req struct {
		Name    string `json:"name"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.Subject == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name, subject, and body required")
	}
	var t EmailTemplate
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO email_templates (name, subject, body)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, subject, body, updated_at`,
		req.Name, req.Subject, req.Body,
	).Scan(&t.ID, &t.Name, &t.Subject, &t.Body, &t.UpdatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "template name already exists")
	}
	return c.JSON(http.StatusCreated, t)
}

func (h *EmailTemplatesHandler) Update(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name    string `json:"name"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.Bind(&req); err != nil || req.Subject == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "subject and body required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE email_templates SET name=$1, subject=$2, body=$3, updated_at=NOW() WHERE id=$4`,
		req.Name, req.Subject, req.Body, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update template")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

func (h *EmailTemplatesHandler) Delete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM email_templates WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
