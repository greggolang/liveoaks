package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

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

type Announcement struct {
	ID                  string     `json:"id"`
	Title               string     `json:"title"`
	Body                string     `json:"body"`
	AuthorID            string     `json:"author_id"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	AuthorFirstName     string     `json:"author_first_name"`
	AuthorLastName      string     `json:"author_last_name"`
	RequireConfirmation bool       `json:"require_confirmation"`
	Confirmed           bool       `json:"confirmed"`      // has the requesting user confirmed?
	ConfirmedCount      int        `json:"confirmed_count"` // total confirmations (for admin display)
}

func (h *AnnouncementsHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT a.id, a.title, a.body, a.author_id, a.created_at, a.updated_at,
		       u.first_name, u.last_name,
		       a.require_confirmation,
		       EXISTS(SELECT 1 FROM announcement_reads ar
		              WHERE ar.announcement_id = a.id AND ar.user_id = $1) AS confirmed,
		       (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) AS confirmed_count
		FROM announcements a
		JOIN users u ON u.id = a.author_id
		ORDER BY a.created_at DESC
		LIMIT 50`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch announcements")
	}
	defer rows.Close()

	announcements := []Announcement{}
	for rows.Next() {
		var a Announcement
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt,
			&a.AuthorFirstName, &a.AuthorLastName,
			&a.RequireConfirmation, &a.Confirmed, &a.ConfirmedCount); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan announcement")
		}
		announcements = append(announcements, a)
	}
	return c.JSON(http.StatusOK, announcements)
}

func (h *AnnouncementsHandler) Create(c echo.Context) error {
	authorID := c.Get("user_id").(string)
	var req struct {
		Title               string `json:"title"`
		Body                string `json:"body"`
		SendEmail           bool   `json:"send_email"`
		RequireConfirmation bool   `json:"require_confirmation"`
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

	var id, title, body string
	var createdAt time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO announcements (title, body, author_id, require_confirmation)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, title, body, created_at`,
		req.Title, req.Body, authorID, req.RequireConfirmation,
	).Scan(&id, &title, &body, &createdAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create announcement")
	}

	if req.SendEmail && h.Mailer != nil {
		go h.emailMembers(title, body, authorName)
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"id":                   id,
		"title":                title,
		"body":                 body,
		"author_id":            authorID,
		"created_at":           createdAt,
		"require_confirmation": req.RequireConfirmation,
		"emailed":              req.SendEmail,
	})
}

// Confirm records that the authenticated user has read/confirmed an announcement.
func (h *AnnouncementsHandler) Confirm(c echo.Context) error {
	userID := c.Get("user_id").(string)
	id := c.Param("id")

	_, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO announcement_reads (announcement_id, user_id)
		 VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`, id, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not confirm read")
	}
	return c.NoContent(http.StatusNoContent)
}

// GetReadStats returns confirmation counts and member lists for an announcement (board+ only).
func (h *AnnouncementsHandler) GetReadStats(c echo.Context) error {
	id := c.Param("id")

	// Total active members
	var totalMembers int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM users WHERE status = 'active'`).Scan(&totalMembers)

	// Members who confirmed
	type ReadEntry struct {
		UserID    string    `json:"user_id"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
		ReadAt    time.Time `json:"read_at"`
	}
	confirmed := []ReadEntry{}
	crows, _ := h.DB.Query(c.Request().Context(), `
		SELECT u.id, u.first_name, u.last_name, ar.read_at
		FROM announcement_reads ar
		JOIN users u ON u.id = ar.user_id
		WHERE ar.announcement_id = $1
		ORDER BY ar.read_at`, id)
	if crows != nil {
		defer crows.Close()
		for crows.Next() {
			var e ReadEntry
			if err := crows.Scan(&e.UserID, &e.FirstName, &e.LastName, &e.ReadAt); err != nil {
				continue
			}
			confirmed = append(confirmed, e)
		}
	}

	// Active members who have NOT confirmed
	type UnreadEntry struct {
		UserID    string `json:"user_id"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}
	unconfirmed := []UnreadEntry{}
	urows, _ := h.DB.Query(c.Request().Context(), `
		SELECT u.id, u.first_name, u.last_name
		FROM users u
		WHERE u.status = 'active'
		  AND NOT EXISTS (
		      SELECT 1 FROM announcement_reads ar
		      WHERE ar.announcement_id = $1 AND ar.user_id = u.id
		  )
		ORDER BY u.last_name, u.first_name`, id)
	if urows != nil {
		defer urows.Close()
		for urows.Next() {
			var e UnreadEntry
			if err := urows.Scan(&e.UserID, &e.FirstName, &e.LastName); err != nil {
				continue
			}
			unconfirmed = append(unconfirmed, e)
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"total_members":    totalMembers,
		"confirmed_count":  len(confirmed),
		"confirmed":        confirmed,
		"unconfirmed":      unconfirmed,
	})
}

func (h *AnnouncementsHandler) Update(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title and body required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE announcements SET title=$1, body=$2, updated_at=NOW() WHERE id=$3`,
		req.Title, req.Body, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update announcement")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

func (h *AnnouncementsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM announcements WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
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
