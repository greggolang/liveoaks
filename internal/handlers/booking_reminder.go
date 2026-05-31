package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BookingReminderHandler struct {
	DB     *pgxpool.Pool
	Mailer interface {
		Send(to, subject, body string) error
	}
	SiteURL string
}

type BookingReminderInfo struct {
	Status     string   `json:"status"`
	PlayerName string   `json:"player_name"`
	IsHost     bool     `json:"is_host"`
	CourtName  string   `json:"court_name"`
	StartTime  string   `json:"start_time"`
	EndTime    string   `json:"end_time"`
	Players    []string `json:"players"`
}

// GetInfo returns the reminder details for the given token (public).
func (h *BookingReminderHandler) GetInfo(c echo.Context) error {
	token := c.Param("token")
	loc := loadTimezone(c.Request().Context(), h.DB)

	var info BookingReminderInfo
	var bookingID string
	var startTime, endTime time.Time
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT bdr.status, bdr.player_name, bdr.is_host, bdr.booking_id,
		       ct.name, b.start_time, b.end_time
		FROM booking_day_reminder_tokens bdr
		JOIN bookings b ON b.id = bdr.booking_id
		JOIN courts ct ON ct.id = b.court_id
		WHERE bdr.token = $1`, token,
	).Scan(&info.Status, &info.PlayerName, &info.IsHost, &bookingID, &info.CourtName, &startTime, &endTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "reminder not found")
	}

	info.StartTime = startTime.In(loc).Format("3:04 PM MST")
	info.EndTime = endTime.In(loc).Format("3:04 PM MST")

	rows, _ := h.DB.Query(c.Request().Context(), `
		SELECT mp.player_name
		FROM match_players mp
		WHERE mp.booking_id = $1
		ORDER BY mp.is_host DESC, mp.added_at`, bookingID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			rows.Scan(&name)
			info.Players = append(info.Players, name)
		}
	}

	return c.JSON(http.StatusOK, info)
}

// Confirm marks the player as good-to-go (public, token-based).
func (h *BookingReminderHandler) Confirm(c echo.Context) error {
	token := c.Param("token")
	var status string
	err := h.DB.QueryRow(c.Request().Context(),
		`UPDATE booking_day_reminder_tokens SET status='confirmed', responded_at=NOW()
		 WHERE token=$1 AND status='pending'
		 RETURNING status`, token,
	).Scan(&status)
	if err != nil {
		// Already responded — return current status
		h.DB.QueryRow(c.Request().Context(),
			`SELECT status FROM booking_day_reminder_tokens WHERE token=$1`, token,
		).Scan(&status)
	}
	if status == "" {
		return echo.NewHTTPError(http.StatusNotFound, "reminder not found")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": status})
}

// ReportIssue records the player's issue note, removes them from the roster (if not host),
// opens a replacement slot, and emails the host (or all players if the host has an issue).
func (h *BookingReminderHandler) ReportIssue(c echo.Context) error {
	token := c.Param("token")
	var req struct {
		Note string `json:"note"`
	}
	c.Bind(&req)

	var reminderID, bookingID, matchPlayerID, playerName, playerEmail string
	var isHost bool
	var matchPlayerIDPtr *string
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT id, booking_id, match_player_id::text, player_name, player_email, is_host
		FROM booking_day_reminder_tokens
		WHERE token = $1`, token,
	).Scan(&reminderID, &bookingID, &matchPlayerIDPtr, &playerName, &playerEmail, &isHost)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "reminder not found")
	}
	if matchPlayerIDPtr != nil {
		matchPlayerID = *matchPlayerIDPtr
	}

	// Mark as issue
	h.DB.Exec(c.Request().Context(),
		`UPDATE booking_day_reminder_tokens SET status='issue', issue_note=$1, responded_at=NOW()
		 WHERE id=$2`, req.Note, reminderID)

	loc := loadTimezone(c.Request().Context(), h.DB)
	var courtName, hostName, hostEmail string
	var startTime, endTime time.Time
	h.DB.QueryRow(c.Request().Context(), `
		SELECT ct.name, u.first_name || ' ' || u.last_name, u.email, b.start_time, b.end_time
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		JOIN users u ON u.id = b.user_id
		WHERE b.id = $1`, bookingID,
	).Scan(&courtName, &hostName, &hostEmail, &startTime, &endTime)

	timeStr := startTime.In(loc).Format("Mon Jan 2 at 3:04 PM MST")
	note := req.Note
	if note == "" {
		note = "(no note provided)"
	}

	if !isHost {
		// Remove player from roster
		if matchPlayerID != "" {
			h.DB.Exec(c.Request().Context(),
				`DELETE FROM match_players WHERE id=$1 AND is_host=false`, matchPlayerID)
		} else {
			h.DB.Exec(c.Request().Context(),
				`DELETE FROM match_players WHERE booking_id=$1 AND player_email=$2 AND is_host=false`,
				bookingID, playerEmail)
		}

		// Open a replacement slot
		h.DB.Exec(c.Request().Context(),
			`UPDATE bookings SET players_needed = players_needed + 1 WHERE id=$1`, bookingID)

		// Email the host
		if hostEmail != "" && h.Mailer != nil {
			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">⚠️ Player Has an Issue</h2>
  <p><strong>%s</strong> has reported an issue with today's booking and has been removed from the roster:</p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin-top:10px">📝 <em>%s</em></div>
  </div>
  <p>A spot has opened up — you can invite a replacement from the bookings page.</p>
  <a href="%s/bookings" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px">
    Find a Replacement →
  </a>
</div>`, playerName, courtName, timeStr, note, h.SiteURL)
			go h.Mailer.Send(hostEmail, playerName+" has an issue with today's booking", body)
		}
	} else {
		// Host has an issue — notify all other players on the roster
		rows, _ := h.DB.Query(c.Request().Context(), `
			SELECT mp.player_name, COALESCE(mp.player_email, u.email)
			FROM match_players mp
			LEFT JOIN users u ON u.id = mp.user_id
			WHERE mp.booking_id = $1 AND mp.is_host = false
			  AND COALESCE(mp.player_email, u.email) IS NOT NULL`, bookingID)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var pName, pEmail string
				if err := rows.Scan(&pName, &pEmail); err != nil {
					continue
				}
				body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">⚠️ Booking Update from Host</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> (the booking host) has reported an issue with today's booking:</p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin-top:10px">📝 <em>%s</em></div>
  </div>
  <p>Please check with the host directly for more information.</p>
</div>`, pName, hostName, courtName, timeStr, note)
				go h.Mailer.Send(pEmail, "Booking update from "+hostName, body)
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "issue"})
}
