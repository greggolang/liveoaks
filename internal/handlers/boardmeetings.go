package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BoardMeetingsHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
}

var boardMeetingRoles = []string{
	"admin", "president", "vice_president", "secretary", "treasurer",
	"billing", "membership", "usta", "entertainment", "house_grounds",
}

type boardMeeting struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	StartTime   string  `json:"start_time"`
	EndTime     *string `json:"end_time,omitempty"`
	Location    *string `json:"location,omitempty"`
	Pending     int     `json:"pending"`
	Accepted    int     `json:"accepted"`
	Declined    int     `json:"declined"`
}

type boardMeetingRSVP struct {
	FirstName   string  `json:"first_name"`
	LastName    string  `json:"last_name"`
	Role        string  `json:"role"`
	Status      string  `json:"status"`
	RespondedAt *string `json:"responded_at,omitempty"`
}

type boardMeetingInvite struct {
	ID          string  `json:"id"`
	EventID     string  `json:"event_id"`
	Token       string  `json:"token"`
	Status      string  `json:"status"`
	Title       string  `json:"title"`
	StartTime   string  `json:"start_time"`
	EndTime     *string `json:"end_time,omitempty"`
	Location    *string `json:"location,omitempty"`
	Description *string `json:"description,omitempty"`
}

// List returns all board meeting events with RSVP counts (board+ only).
func (h *BoardMeetingsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT e.id, e.title, e.description,
		       to_char(e.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(e.end_time   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       e.location,
		       COUNT(bmi.id) FILTER (WHERE bmi.status = 'invited')  AS pending,
		       COUNT(bmi.id) FILTER (WHERE bmi.status = 'accepted') AS accepted,
		       COUNT(bmi.id) FILTER (WHERE bmi.status = 'declined') AS declined
		FROM events e
		LEFT JOIN board_meeting_invitations bmi ON bmi.event_id = e.id
		WHERE e.event_type = 'board_meeting'
		GROUP BY e.id
		ORDER BY e.start_time DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch board meetings")
	}
	defer rows.Close()
	out := []boardMeeting{}
	for rows.Next() {
		var m boardMeeting
		rows.Scan(&m.ID, &m.Title, &m.Description, &m.StartTime, &m.EndTime,
			&m.Location, &m.Pending, &m.Accepted, &m.Declined)
		out = append(out, m)
	}
	return c.JSON(http.StatusOK, out)
}

// Roster returns the RSVP list for a specific meeting (board+ only).
func (h *BoardMeetingsHandler) Roster(c echo.Context) error {
	eventID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT u.first_name, u.last_name, u.role, bmi.status,
		       to_char(bmi.responded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM board_meeting_invitations bmi
		JOIN users u ON u.id = bmi.user_id
		WHERE bmi.event_id = $1
		ORDER BY bmi.status, u.last_name`, eventID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch roster")
	}
	defer rows.Close()
	out := []boardMeetingRSVP{}
	for rows.Next() {
		var r boardMeetingRSVP
		rows.Scan(&r.FirstName, &r.LastName, &r.Role, &r.Status, &r.RespondedAt)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// Create creates a board meeting event and sends invitations to all board members.
func (h *BoardMeetingsHandler) Create(c echo.Context) error {
	authorID := c.Get("user_id").(string)
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		StartTime   string `json:"start_time"`
		EndTime     string `json:"end_time"`
		Location    string `json:"location"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" || req.StartTime == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title and start time required")
	}

	// Create the event record
	var eventID string
	var startTime time.Time
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO events (title, description, start_time, end_time, event_type, location, author_id)
		VALUES ($1, NULLIF($2,''), $3, NULLIF($4,'')::timestamptz, 'board_meeting', NULLIF($5,''), $6)
		RETURNING id, start_time`,
		req.Title, req.Description, req.StartTime, req.EndTime, req.Location, authorID,
	).Scan(&eventID, &startTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create board meeting")
	}

	// Find all active board members (primary role OR extra_roles)
	memberRows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, first_name, last_name, email FROM users
		WHERE status = 'active'
		  AND (role = ANY($1) OR extra_roles && $1)
		ORDER BY last_name, first_name`,
		boardMeetingRoles,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch board members")
	}
	defer memberRows.Close()

	type member struct{ id, name, email string }
	var members []member
	for memberRows.Next() {
		var m member
		var first, last string
		if memberRows.Scan(&m.id, &first, &last, &m.email) == nil {
			m.name = first + " " + last
			members = append(members, m)
		}
	}

	loc := loadTimezone(c.Request().Context(), h.DB)
	dateStr := startTime.In(loc).Format("Monday, January 2, 2006 at 3:04 PM MST")
	sent := 0

	for _, m := range members {
		b := make([]byte, 20)
		rand.Read(b)
		token := hex.EncodeToString(b)

		var invID string
		if err := h.DB.QueryRow(c.Request().Context(), `
			INSERT INTO board_meeting_invitations (event_id, user_id, token)
			VALUES ($1, $2, $3)
			ON CONFLICT (event_id, user_id) DO NOTHING
			RETURNING id`,
			eventID, m.id, token,
		).Scan(&invID); err != nil {
			continue
		}

		// Permanently log this invitation so the record survives future role changes.
		LogBoardComm(h.DB, "meeting", invID, req.Title, req.Description,
			"", "Club Secretary", "",
			m.id, m.name, m.email)

		if h.Mailer != nil && m.email != "" && notifprefs.UserWantsEmail(c.Request().Context(), h.DB, m.id, "board_meeting") {
			acceptURL := fmt.Sprintf("%s/board-meeting/%s/accept", h.SiteURL, token)
			declineURL := fmt.Sprintf("%s/board-meeting/%s/decline", h.SiteURL, token)
			go h.sendInviteEmail(m.email, m.name, req.Title, dateStr, req.Location, req.Description, acceptURL, declineURL)
			sent++
		}
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"id": eventID, "invited": sent,
	})
}

// Delete cancels a board meeting and its invitations (board+ only).
func (h *BoardMeetingsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM events WHERE id = $1 AND event_type = 'board_meeting'`, id)
	return c.NoContent(http.StatusNoContent)
}

// MyInvitations returns the authenticated user's upcoming board meeting invitations.
func (h *BoardMeetingsHandler) MyInvitations(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT bmi.id, bmi.event_id, bmi.token, bmi.status,
		       e.title,
		       to_char(e.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(e.end_time   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       e.location, e.description
		FROM board_meeting_invitations bmi
		JOIN events e ON e.id = bmi.event_id
		WHERE bmi.user_id = $1
		  AND e.start_time > NOW()
		  AND bmi.status != 'declined'
		ORDER BY e.start_time`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch invitations")
	}
	defer rows.Close()
	out := []boardMeetingInvite{}
	for rows.Next() {
		var i boardMeetingInvite
		if err := rows.Scan(&i.ID, &i.EventID, &i.Token, &i.Status,
			&i.Title, &i.StartTime, &i.EndTime, &i.Location, &i.Description); err != nil {
			continue
		}
		out = append(out, i)
	}
	return c.JSON(http.StatusOK, out)
}

// Respond handles accept/decline via token (public — no auth required).
func (h *BoardMeetingsHandler) Respond(c echo.Context) error {
	token := c.Param("token")
	action := c.Param("action")
	if action != "accept" && action != "decline" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid action"})
	}
	newStatus := "declined"
	if action == "accept" {
		newStatus = "accepted"
	}

	var dummy string
	err := h.DB.QueryRow(context.Background(), `
		UPDATE board_meeting_invitations
		SET status = $1, responded_at = NOW()
		WHERE token = $2 AND status = 'invited'
		RETURNING id`, newStatus, token,
	).Scan(&dummy)
	if err != nil {
		// Already responded or token not found — still return OK so the page shows cleanly
		return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
}

func (h *BoardMeetingsHandler) sendInviteEmail(to, name, title, dateStr, location, description, acceptURL, declineURL string) {
	locLine := ""
	if location != "" {
		locLine = fmt.Sprintf(`<p style="margin:4px 0">📍 <strong>%s</strong></p>`, location)
	}
	descBlock := ""
	if description != "" {
		descBlock = fmt.Sprintf(`<div style="margin-top:12px;padding-top:12px;border-top:1px solid #bfdbfe;font-size:14px;white-space:pre-line;color:#1e3a5f">%s</div>`, description)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#1e40af">🏛️ Board Meeting Invitation</h2>
  <p>Hi %s,</p>
  <p>You have been invited to the following board meeting:</p>
  <div style="background:#eff6ff;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0 0 8px;font-size:16px;font-weight:bold;color:#1e3a5f">%s</p>
    <p style="margin:4px 0">📅 <strong>%s</strong></p>
    %s%s
  </div>
  <p>Please let us know if you can attend:</p>
  <div style="margin:24px 0">
    <a href="%s" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✓ Accept</a>
    &nbsp;&nbsp;
    <a href="%s" style="background:#6b7280;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✗ Decline</a>
  </div>
  <p style="color:#9ca3af;font-size:12px">You can change your response by clicking the links above.</p>
</div>`, name, title, dateStr, locLine, descBlock, acceptURL, declineURL)
	h.Mailer.Send(to, "Board Meeting: "+title, body)
}
