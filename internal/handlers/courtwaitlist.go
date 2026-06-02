package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type CourtWaitlistHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
}

type waitlistSlotSummary struct {
	CourtID     int     `json:"court_id"`
	StartTime   string  `json:"start_time"`
	EndTime     string  `json:"end_time"`
	Count       int     `json:"count"`
	IsMine      bool    `json:"is_mine"`
	MyEntryID   *string `json:"my_entry_id,omitempty"`
}

type myWaitlistEntry struct {
	ID         string     `json:"id"`
	CourtID    int        `json:"court_id"`
	CourtName  string     `json:"court_name"`
	StartTime  time.Time  `json:"start_time"`
	EndTime    time.Time  `json:"end_time"`
	Position   int        `json:"position"`
	NotifiedAt *time.Time `json:"notified_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ListForDate returns per-slot waitlist summaries for a date.
// Each row indicates count + whether the current user is already on that slot's list.
func (h *CourtWaitlistHandler) ListForDate(c echo.Context) error {
	ctx := c.Request().Context()
	userID := c.Get("user_id").(string)
	date := c.QueryParam("date")
	if date == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "date required")
	}

	rows, err := h.DB.Query(ctx, `
		SELECT cw.court_id,
		       to_char(cw.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS start_time,
		       to_char(cw.end_time   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS end_time,
		       COUNT(*)::int AS total,
		       bool_or(cw.user_id = $1) AS is_mine,
		       MIN(CASE WHEN cw.user_id = $1 THEN cw.id::text END) AS my_entry_id
		FROM court_waitlist cw
		WHERE cw.start_time::date = $2::date
		  AND cw.start_time > NOW()
		GROUP BY cw.court_id, cw.start_time, cw.end_time
		ORDER BY cw.court_id, cw.start_time
	`, userID, date)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	result := []waitlistSlotSummary{}
	for rows.Next() {
		var s waitlistSlotSummary
		if err := rows.Scan(&s.CourtID, &s.StartTime, &s.EndTime, &s.Count, &s.IsMine, &s.MyEntryID); err != nil {
			continue
		}
		result = append(result, s)
	}
	return c.JSON(http.StatusOK, result)
}

// MyEntries returns the current user's future waitlist entries with queue position.
func (h *CourtWaitlistHandler) MyEntries(c echo.Context) error {
	ctx := c.Request().Context()
	userID := c.Get("user_id").(string)

	rows, err := h.DB.Query(ctx, `
		SELECT cw.id, cw.court_id, ct.name,
		       cw.start_time, cw.end_time, cw.notified_at, cw.created_at,
		       (SELECT COUNT(*) FROM court_waitlist w2
		        WHERE w2.court_id = cw.court_id
		          AND w2.start_time = cw.start_time
		          AND w2.created_at < cw.created_at) + 1 AS position
		FROM court_waitlist cw
		JOIN courts ct ON ct.id = cw.court_id
		WHERE cw.user_id = $1
		  AND cw.start_time > NOW()
		ORDER BY cw.start_time
	`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	entries := []myWaitlistEntry{}
	for rows.Next() {
		var e myWaitlistEntry
		if err := rows.Scan(&e.ID, &e.CourtID, &e.CourtName, &e.StartTime, &e.EndTime, &e.NotifiedAt, &e.CreatedAt, &e.Position); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return c.JSON(http.StatusOK, entries)
}

// Join adds the current user to the waitlist for a court+time slot.
func (h *CourtWaitlistHandler) Join(c echo.Context) error {
	ctx := c.Request().Context()
	userID := c.Get("user_id").(string)

	var req struct {
		CourtID   int    `json:"court_id"`
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
	}
	if err := c.Bind(&req); err != nil || req.CourtID == 0 || req.StartTime == "" || req.EndTime == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "court_id, start_time, and end_time are required")
	}

	start, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start_time")
	}
	end, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end_time")
	}
	if start.Before(time.Now()) {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot join waitlist for a past slot")
	}

	// Verify the slot is actually booked
	var bookingCount int
	h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM bookings
		WHERE court_id = $1 AND start_time < $2 AND end_time > $3
	`, req.CourtID, end, start).Scan(&bookingCount)
	if bookingCount == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "that court slot is not currently booked")
	}

	// Don't let the booking owner join their own waitlist
	var ownerCount int
	h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM bookings
		WHERE user_id = $1 AND court_id = $2 AND start_time < $3 AND end_time > $4
	`, userID, req.CourtID, end, start).Scan(&ownerCount)
	if ownerCount > 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "you already have this court booked")
	}

	var id string
	err = h.DB.QueryRow(ctx, `
		INSERT INTO court_waitlist (court_id, user_id, start_time, end_time)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (court_id, user_id, start_time) DO UPDATE SET end_time = EXCLUDED.end_time
		RETURNING id
	`, req.CourtID, userID, start, end).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not join waitlist")
	}

	// Return position in queue
	var position int
	h.DB.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM court_waitlist
		        WHERE court_id = $1 AND start_time = $2 AND created_at < (SELECT created_at FROM court_waitlist WHERE id = $3)
		) + 1
	`, req.CourtID, start, id).Scan(&position)
	if position == 0 {
		position = 1
	}

	// Dashboard alert confirming the waitlist join
	var courtName string
	h.DB.QueryRow(ctx, `SELECT name FROM courts WHERE id = $1`, req.CourtID).Scan(&courtName)
	loc, _ := time.LoadLocation("America/Los_Angeles")
	if loc == nil {
		loc = time.UTC
	}
	alertMsg := fmt.Sprintf(
		"You joined the waitlist for %s on %s at %s – %s. You are #%d in the queue.",
		courtName,
		start.In(loc).Format("Mon, Jan 2"),
		start.In(loc).Format("3:04 PM"),
		end.In(loc).Format("3:04 PM"),
		position,
	)
	h.DB.Exec(ctx, `INSERT INTO member_alerts (user_id, message, type) VALUES ($1, $2, 'info')`, userID, alertMsg)

	return c.JSON(http.StatusOK, map[string]interface{}{"id": id, "position": position})
}

// Leave removes the current user from a waitlist entry.
func (h *CourtWaitlistHandler) Leave(c echo.Context) error {
	ctx := c.Request().Context()
	userID := c.Get("user_id").(string)
	id := c.Param("id")

	result, err := h.DB.Exec(ctx,
		`DELETE FROM court_waitlist WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if result.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "waitlist entry not found")
	}
	return c.NoContent(http.StatusNoContent)
}

// NotifyCourtWaitlist is called after a booking is deleted.
// It emails all users waiting for that court+time in queue order.
func NotifyCourtWaitlist(
	ctx context.Context,
	db *pgxpool.Pool,
	mailer interface{ Send(to, subject, body string) error },
	siteURL string,
	courtID int, courtName string,
	startTime, endTime time.Time,
	loc *time.Location,
) {
	if mailer == nil {
		return
	}
	if loc == nil {
		loc = time.UTC
	}

	rows, err := db.Query(ctx, `
		SELECT cw.id, u.id, u.first_name, u.email,
		       ROW_NUMBER() OVER (ORDER BY cw.created_at) AS position
		FROM court_waitlist cw
		JOIN users u ON u.id = cw.user_id
		WHERE cw.court_id = $1
		  AND cw.start_time = $2
		  AND cw.start_time > NOW()
		ORDER BY cw.created_at
	`, courtID, startTime)
	if err != nil {
		return
	}
	defer rows.Close()

	type waiter struct {
		entryID   string
		userID    string
		firstName string
		email     string
		position  int
	}
	var waiters []waiter
	for rows.Next() {
		var w waiter
		if rows.Scan(&w.entryID, &w.userID, &w.firstName, &w.email, &w.position) == nil {
			waiters = append(waiters, w)
		}
	}
	rows.Close()

	if len(waiters) == 0 {
		return
	}

	dateStr := startTime.In(loc).Format("Monday, January 2")
	timeStr := startTime.In(loc).Format("3:04 PM") + " – " + endTime.In(loc).Format("3:04 PM MST")
	bookURL := fmt.Sprintf("%s/bookings?date=%s", siteURL, startTime.Format("2006-01-02"))

	// Mark all as notified, create dashboard alerts, and send emails concurrently
	for _, w := range waiters {
		db.Exec(ctx, `UPDATE court_waitlist SET notified_at = NOW() WHERE id = $1`, w.entryID)

		// In-app alert
		var positionText string
		if w.position == 1 {
			positionText = "You are first in the queue — book now!"
		} else {
			positionText = fmt.Sprintf("You are #%d in the queue.", w.position)
		}
		db.Exec(ctx, `INSERT INTO member_alerts (user_id, message, type) VALUES ($1, $2, 'info')`,
			w.userID,
			fmt.Sprintf("Court available: %s on %s, %s. %s", courtName, dateStr, timeStr, positionText),
		)

		w := w // capture
		positionNote := ""
		if w.position == 1 {
			positionNote = `<p style="color:#166534;font-weight:600">You are first in the queue — book now before someone else does!</p>`
		} else {
			positionNote = fmt.Sprintf(`<p style="color:#92400e">You are #%d in the queue.</p>`, w.position)
		}

		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Court Available!</h2>
  <p>Hi %s,</p>
  <p>A court you're waiting for has just opened up:</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0"><strong>%s</strong></div>
    <div style="margin:4px 0">%s</div>
    <div style="margin:4px 0">%s</div>
  </div>
  %s
  <p style="margin:24px 0">
    <a href="%s" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
      Book this court →
    </a>
  </p>
  <p style="color:#6b7280;font-size:13px">
    If you no longer need this slot you can remove yourself from the waitlist in the Bookings page.
  </p>
</div>`, w.firstName, courtName, dateStr, timeStr, positionNote, bookURL)

		go func() {
			if notifprefs.UserWantsEmail(ctx, db, w.userID, "court_waitlist") {
				mailer.Send(w.email, fmt.Sprintf("Court available — %s on %s", courtName, dateStr), body)
			}
		}()
	}
}
