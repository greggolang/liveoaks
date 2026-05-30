package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type AnnouncementMailer interface {
	Send(to, subject, body string) error
}

type AnnouncementsHandler struct {
	DB      *pgxpool.Pool
	Mailer  AnnouncementMailer
	SiteURL string
}

func (h *AnnouncementsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT a.id, a.title, a.body, a.author_id, a.created_at, a.updated_at,
		        u.first_name, u.last_name
		 FROM announcements a
		 JOIN users u ON u.id = a.author_id
		 ORDER BY a.created_at DESC
		 LIMIT 50`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch announcements")
	}
	defer rows.Close()

	announcements := []models.Announcement{}
	for rows.Next() {
		var a models.Announcement
		a.Author = &models.User{}
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt,
			&a.Author.FirstName, &a.Author.LastName); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan announcement")
		}
		announcements = append(announcements, a)
	}
	return c.JSON(http.StatusOK, announcements)
}

func (h *AnnouncementsHandler) Create(c echo.Context) error {
	authorID := c.Get("user_id").(string)
	var req struct {
		Title     string `json:"title"`
		Body      string `json:"body"`
		SendEmail bool   `json:"send_email"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Title == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title and body required")
	}

	var authorName string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name || ' ' || last_name FROM users WHERE id = $1`, authorID).Scan(&authorName)

	var a models.Announcement
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO announcements (title, body, author_id)
		 VALUES ($1, $2, $3)
		 RETURNING id, title, body, author_id, created_at, updated_at`,
		req.Title, req.Body, authorID,
	).Scan(&a.ID, &a.Title, &a.Body, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create announcement")
	}

	if req.SendEmail && h.Mailer != nil {
		go h.emailMembers(req.Title, req.Body, authorName)
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"id":         a.ID,
		"title":      a.Title,
		"body":       a.Body,
		"author_id":  a.AuthorID,
		"created_at": a.CreatedAt,
		"emailed":    req.SendEmail,
	})
}

func (h *AnnouncementsHandler) emailMembers(title, body, authorName string) {
	rows, err := h.DB.Query(context.Background(),
		`SELECT email, first_name FROM users WHERE status = 'active'`)
	if err != nil {
		return
	}
	defer rows.Close()

	emailBody := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Liveoaks Tennis Club</h2>
  <h3 style="color:#1f2937;margin-top:0">%s</h3>
  <div style="color:#374151;line-height:1.6;white-space:pre-wrap">%s</div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">
    Posted by %s · <a href="%s/announcements" style="color:#15803d">View all announcements</a>
  </p>
</div>`, title, body, authorName, h.SiteURL)

	for rows.Next() {
		var email, firstName string
		if err := rows.Scan(&email, &firstName); err != nil {
			continue
		}
		h.Mailer.Send(email, "📢 "+title+" — Liveoaks Tennis Club", emailBody)
		time.Sleep(time.Second)
	}
}

func (h *AnnouncementsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM announcements WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}
