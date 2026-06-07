package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BroadcastHandler struct {
	DB     *pgxpool.Pool
	Mailer interface{ Send(to, subject, body string) error }
}


type broadcastRecipient struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Email string `json:"email"`
	Role string `json:"role"`
}

// PreviewRecipients returns the list of members who would receive the broadcast.
func (h *BroadcastHandler) PreviewRecipients(c echo.Context) error {
	roles := c.QueryParams()["role"] // optional filter: ?role=member&role=billing
	var rows interface {
		Next() bool; Close(); Scan(...interface{}) error
	}
	var err error
	if len(roles) > 0 {
		rows, err = h.DB.Query(c.Request().Context(), `
			SELECT id, first_name||' '||last_name, email, role
			FROM users
			WHERE status = 'active' AND role = ANY($1)
			ORDER BY first_name, last_name`, roles)
	} else {
		rows, err = h.DB.Query(c.Request().Context(), `
			SELECT id, first_name||' '||last_name, email, role
			FROM users
			WHERE status = 'active'
			ORDER BY first_name, last_name`)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch recipients")
	}
	defer rows.Close()
	out := []broadcastRecipient{}
	for rows.Next() {
		var r broadcastRecipient
		rows.Scan(&r.ID, &r.Name, &r.Email, &r.Role)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// Send verifies the confirm code then emails all active members.
func (h *BroadcastHandler) Send(c echo.Context) error {
	var req struct {
		Subject     string   `json:"subject"`
		Body        string   `json:"body"`
		ConfirmCode string   `json:"confirm_code"`
		Roles       []string `json:"roles"` // empty = all active members
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Subject == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "subject and body required")
	}

	// Verify confirmation code against stored setting
	var stored string
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'broadcast_confirm_code'`).Scan(&stored); err != nil || stored == "" {
		stored = "" // no code configured — block send
	}
	if req.ConfirmCode != stored {
		return echo.NewHTTPError(http.StatusForbidden, "incorrect confirmation code")
	}

	// Fetch recipients
	var rows interface {
		Next() bool; Close(); Scan(...interface{}) error
	}
	var err error
	if len(req.Roles) > 0 {
		rows, err = h.DB.Query(c.Request().Context(), `
			SELECT id, first_name||' '||last_name, email
			FROM users WHERE status = 'active' AND role = ANY($1)
			ORDER BY first_name, last_name`, req.Roles)
	} else {
		rows, err = h.DB.Query(c.Request().Context(), `
			SELECT id, first_name||' '||last_name, email
			FROM users WHERE status = 'active'
			ORDER BY first_name, last_name`)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch recipients")
	}
	defer rows.Close()

	type recipient struct{ id, name, email string }
	recipients := []recipient{}
	for rows.Next() {
		var id, name, email string
		rows.Scan(&id, &name, &email)
		if email != "" {
			recipients = append(recipients, recipient{id, name, email})
		}
	}

	if len(recipients) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no recipients found")
	}

	// Send in background, throttled 1/second to avoid SMTP relay limits
	go func() {
		for _, r := range recipients {
			if !notifprefs.UserWantsEmail(context.Background(), h.DB, r.id, "broadcast") {
				continue
			}
			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
%s
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
<p style="color:#9ca3af;font-size:12px">
  You're receiving this as an active member of Liveoaks Tennis Club.<br>
  If you have questions, reply to this email or contact the club directly.
</p>
</div>`, req.Body)
			h.Mailer.Send(r.email, req.Subject, body)
			time.Sleep(time.Second)
		}
	}()

	// Log who sent it
	senderID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(), `
		INSERT INTO settings (key, value)
		VALUES ('broadcast_last_sent', $1)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
		fmt.Sprintf("%d recipients by %s at %s", len(recipients), senderID,
			time.Now().Format("2006-01-02 15:04:05")))

	return c.JSON(http.StatusOK, map[string]interface{}{
		"sent":    len(recipients),
		"message": fmt.Sprintf("Sending to %d members in the background.", len(recipients)),
	})
}

// BookingRecipients returns the unique set of players with bookings in the given date window.
// Query params: date_from (YYYY-MM-DD), date_to (YYYY-MM-DD), court_id (optional int).
func (h *BroadcastHandler) BookingRecipients(c echo.Context) error {
	dateFrom := c.QueryParam("date_from")
	dateTo := c.QueryParam("date_to")
	if dateFrom == "" || dateTo == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "date_from and date_to are required")
	}
	courtID := c.QueryParam("court_id")

	var args []interface{}
	args = append(args, dateFrom, dateTo)
	courtFilter := ""
	if courtID != "" {
		if _, err := strconv.Atoi(courtID); err == nil {
			args = append(args, courtID)
			courtFilter = fmt.Sprintf(" AND b.court_id = $%d", len(args))
		}
	}

	q := fmt.Sprintf(`
		SELECT DISTINCT u.id, u.first_name||' '||u.last_name AS name, u.email
		FROM users u
		WHERE u.status = 'active' AND u.email != ''
		AND u.id IN (
			SELECT b.user_id FROM bookings b
			WHERE b.start_time::date >= $1 AND b.start_time::date <= $2%s
			UNION
			SELECT mp.user_id FROM match_players mp
			JOIN bookings b ON b.id = mp.booking_id
			WHERE mp.user_id IS NOT NULL AND mp.withdrew_at IS NULL
			AND b.start_time::date >= $1 AND b.start_time::date <= $2%s
		)
		ORDER BY name`, courtFilter, courtFilter)

	rows, err := h.DB.Query(c.Request().Context(), q, args...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch recipients")
	}
	defer rows.Close()
	out := []broadcastRecipient{}
	for rows.Next() {
		var r broadcastRecipient
		rows.Scan(&r.ID, &r.Name, &r.Email)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// SendToBookings emails all players with bookings in the given date window.
func (h *BroadcastHandler) SendToBookings(c echo.Context) error {
	var req struct {
		Subject     string `json:"subject"`
		Body        string `json:"body"`
		ConfirmCode string `json:"confirm_code"`
		DateFrom    string `json:"date_from"`
		DateTo      string `json:"date_to"`
		CourtID     string `json:"court_id"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Subject == "" || req.Body == "" || req.DateFrom == "" || req.DateTo == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "subject, body, date_from and date_to are required")
	}

	var stored string
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'broadcast_confirm_code'`).Scan(&stored); err != nil || stored == "" {
		stored = ""
	}
	if req.ConfirmCode != stored {
		return echo.NewHTTPError(http.StatusForbidden, "incorrect confirmation code")
	}

	var args []interface{}
	args = append(args, req.DateFrom, req.DateTo)
	courtFilter := ""
	if req.CourtID != "" {
		if _, err := strconv.Atoi(req.CourtID); err == nil {
			args = append(args, req.CourtID)
			courtFilter = fmt.Sprintf(" AND b.court_id = $%d", len(args))
		}
	}

	q := fmt.Sprintf(`
		SELECT DISTINCT u.id, u.first_name||' '||u.last_name AS name, u.email
		FROM users u
		WHERE u.status = 'active' AND u.email != ''
		AND u.id IN (
			SELECT b.user_id FROM bookings b
			WHERE b.start_time::date >= $1 AND b.start_time::date <= $2%s
			UNION
			SELECT mp.user_id FROM match_players mp
			JOIN bookings b ON b.id = mp.booking_id
			WHERE mp.user_id IS NOT NULL AND mp.withdrew_at IS NULL
			AND b.start_time::date >= $1 AND b.start_time::date <= $2%s
		)
		ORDER BY name`, courtFilter, courtFilter)

	rows, err := h.DB.Query(c.Request().Context(), q, args...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch recipients")
	}
	defer rows.Close()

	type recipient struct{ id, name, email string }
	var recipients []recipient
	for rows.Next() {
		var id, name, email string
		rows.Scan(&id, &name, &email)
		if email != "" {
			recipients = append(recipients, recipient{id, name, email})
		}
	}
	if len(recipients) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no recipients found for the selected date range")
	}

	go func() {
		for _, r := range recipients {
			if !notifprefs.UserWantsEmail(context.Background(), h.DB, r.id, "broadcast") {
				continue
			}
			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
%s
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
<p style="color:#9ca3af;font-size:12px">
  You're receiving this because you have a court booking during the referenced time period.<br>
  If you have questions, reply to this email or contact the club directly.
</p>
</div>`, req.Body)
			h.Mailer.Send(r.email, req.Subject, body)
			time.Sleep(time.Second)
		}
	}()

	senderID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(), `
		INSERT INTO settings (key, value)
		VALUES ('booking_message_last_sent', $1)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
		fmt.Sprintf("%d recipients by %s at %s", len(recipients), senderID,
			time.Now().Format("2006-01-02 15:04:05")))

	return c.JSON(http.StatusOK, map[string]interface{}{
		"sent":    len(recipients),
		"message": fmt.Sprintf("Sending to %d players in the background.", len(recipients)),
	})
}
