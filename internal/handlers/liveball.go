package handlers

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type LiveballHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
}

type liveball struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	StartTime   string  `json:"start_time"`
	EndTime     *string `json:"end_time"`
	MaxPlayers  int     `json:"max_players"`
	// Counts populated from invitations
	Confirmed int `json:"confirmed"`
	Waitlisted int `json:"waitlisted"`
	Invited    int `json:"invited"`
	Declined   int `json:"declined"`
}

type liveballInvite struct {
	ID          string  `json:"id"`
	EventID     string  `json:"event_id"`
	UserID      string  `json:"user_id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	USTARanking string  `json:"usta_ranking"`
	Status      string  `json:"status"`
	Position    *int    `json:"position"`
	InvitedAt   string  `json:"invited_at"`
	RespondedAt *string `json:"responded_at"`
}

// ─────────────────────────────────────────────
// Admin endpoints
// ─────────────────────────────────────────────

func (h *LiveballHandler) AdminListEvents(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT e.id, e.title, e.description,
		       to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(e.end_time,   'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(e.max_players, 0),
		       COUNT(li.id) FILTER (WHERE li.status = 'confirmed')   AS confirmed,
		       COUNT(li.id) FILTER (WHERE li.status = 'waitlisted')  AS waitlisted,
		       COUNT(li.id) FILTER (WHERE li.status = 'invited')     AS invited,
		       COUNT(li.id) FILTER (WHERE li.status = 'declined')    AS declined
		FROM events e
		LEFT JOIN liveball_invitations li ON li.event_id = e.id
		WHERE e.event_type = 'liveball'
		GROUP BY e.id
		ORDER BY e.start_time DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch events")
	}
	defer rows.Close()
	out := []liveball{}
	for rows.Next() {
		var lb liveball
		rows.Scan(&lb.ID, &lb.Title, &lb.Description, &lb.StartTime, &lb.EndTime,
			&lb.MaxPlayers, &lb.Confirmed, &lb.Waitlisted, &lb.Invited, &lb.Declined)
		out = append(out, lb)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *LiveballHandler) AdminCreateEvent(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Title       string    `json:"title"`
		Description string    `json:"description"`
		StartTime   time.Time `json:"start_time"`
		EndTime     *time.Time `json:"end_time"`
		MaxPlayers  int       `json:"max_players"`
	}
	if err := c.Bind(&req); err != nil || req.MaxPlayers < 1 {
		return echo.NewHTTPError(http.StatusBadRequest, "title, start_time, and max_players required")
	}
	if req.Title == "" {
		req.Title = fmt.Sprintf("LiveBall – %s", req.StartTime.Format("Mon Jan 2"))
	}
	var id string
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO events (title, description, start_time, end_time, event_type, author_id, signup_enabled, max_players)
		VALUES ($1, $2, $3, $4, 'liveball', $5, true, $6)
		RETURNING id`,
		req.Title, req.Description, req.StartTime, req.EndTime, userID, req.MaxPlayers,
	).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create event")
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": id, "title": req.Title})
}

func (h *LiveballHandler) AdminGetRoster(c echo.Context) error {
	eventID := c.Param("id")
	ctx := c.Request().Context()

	var lb liveball
	err := h.DB.QueryRow(ctx, `
		SELECT e.id, e.title, e.description,
		       to_char(e.start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(e.end_time,   'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(e.max_players, 0)
		FROM events e WHERE e.id = $1 AND e.event_type = 'liveball'`, eventID,
	).Scan(&lb.ID, &lb.Title, &lb.Description, &lb.StartTime, &lb.EndTime, &lb.MaxPlayers)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "event not found")
	}

	rows, err := h.DB.Query(ctx, `
		SELECT li.id, li.event_id, li.user_id,
		       u.first_name||' '||u.last_name, u.email, COALESCE(u.usta_ranking,''),
		       li.status, li.position,
		       to_char(li.invited_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(li.responded_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM liveball_invitations li
		JOIN users u ON u.id = li.user_id
		WHERE li.event_id = $1
		ORDER BY
		  CASE li.status
		    WHEN 'confirmed'  THEN 1
		    WHEN 'waitlisted' THEN 2
		    WHEN 'invited'    THEN 3
		    WHEN 'declined'   THEN 4
		    ELSE 5
		  END,
		  li.position NULLS LAST, li.responded_at NULLS LAST, li.invited_at`, eventID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch roster")
	}
	defer rows.Close()
	invitations := []liveballInvite{}
	for rows.Next() {
		var inv liveballInvite
		rows.Scan(&inv.ID, &inv.EventID, &inv.UserID, &inv.Name, &inv.Email, &inv.USTARanking,
			&inv.Status, &inv.Position, &inv.InvitedAt, &inv.RespondedAt)
		invitations = append(invitations, inv)
	}

	lb.Confirmed = countByStatus(invitations, "confirmed")
	lb.Waitlisted = countByStatus(invitations, "waitlisted")
	lb.Invited = countByStatus(invitations, "invited")
	lb.Declined = countByStatus(invitations, "declined")

	return c.JSON(http.StatusOK, map[string]interface{}{
		"event":       lb,
		"invitations": invitations,
	})
}

// AdminSendInvites sends invites to all approved members with matching USTA levels
// who haven't already been invited to this event.
func (h *LiveballHandler) AdminSendInvites(c echo.Context) error {
	eventID := c.Param("id")
	ctx := c.Request().Context()
	var req struct {
		USTALevels []string `json:"usta_levels"` // e.g. ["3.0","3.5"]
		UserIDs    []string `json:"user_ids"`    // optional: specific user IDs
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if len(req.USTALevels) == 0 && len(req.UserIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "usta_levels or user_ids required")
	}

	// Load event details
	var title, startStr string
	var maxPlayers int
	if err := h.DB.QueryRow(ctx, `
		SELECT title, to_char(start_time,'Mon DD at HH12:MI AM'), COALESCE(max_players,0)
		FROM events WHERE id=$1`, eventID,
	).Scan(&title, &startStr, &maxPlayers); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "event not found")
	}

	// Collect eligible members not yet invited
	var memberRows interface {
		Next() bool; Close(); Scan(...interface{}) error
	}
	var err error
	if len(req.UserIDs) > 0 {
		memberRows, err = h.DB.Query(ctx, `
			SELECT u.id, u.first_name||' '||u.last_name, u.email
			FROM users u
			WHERE u.id = ANY($1) AND u.status = 'active'
			  AND NOT EXISTS (
			    SELECT 1 FROM liveball_invitations li WHERE li.event_id=$2 AND li.user_id=u.id
			  )`, req.UserIDs, eventID)
	} else {
		memberRows, err = h.DB.Query(ctx, `
			SELECT u.id, u.first_name||' '||u.last_name, u.email
			FROM users u
			WHERE u.usta_ranking = ANY($1) AND u.status = 'active'
			  AND NOT EXISTS (
			    SELECT 1 FROM liveball_invitations li WHERE li.event_id=$2 AND li.user_id=u.id
			  )`, req.USTALevels, eventID)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch members")
	}
	defer memberRows.Close()

	type member struct{ id, name, email string }
	members := []member{}
	for memberRows.Next() {
		var m member
		memberRows.Scan(&m.id, &m.name, &m.email)
		members = append(members, m)
	}

	sent := 0
	for _, m := range members {
		tokBytes := make([]byte, 20)
		rand.Read(tokBytes)
		token := hex.EncodeToString(tokBytes)

		// ON CONFLICT DO NOTHING is a safety net for concurrent sends.
		// If RowsAffected == 0 the token was never stored — skip the email so
		// the member doesn't receive a link that resolves to "not found".
		tag, insErr := h.DB.Exec(ctx, `
			INSERT INTO liveball_invitations (event_id, user_id, token)
			VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING`,
			eventID, m.id, token)
		if insErr != nil || tag.RowsAffected() == 0 {
			continue
		}

		acceptURL := fmt.Sprintf("%s/liveball/%s/accept", h.SiteURL, token)
		declineURL := fmt.Sprintf("%s/liveball/%s/decline", h.SiteURL, token)
		go h.sendInviteEmail(m.email, m.name, title, startStr, maxPlayers, acceptURL, declineURL)
		sent++
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"sent":    sent,
		"skipped": len(members) - sent,
	})
}

// AdminPreviewInvites returns who would be invited for the given USTA levels (no emails sent).
func (h *LiveballHandler) AdminPreviewInvites(c echo.Context) error {
	eventID := c.Param("id")
	var levels []string
	if err := c.Bind(&struct{ USTALevels *[]string `json:"usta_levels"` }{&levels}); err != nil {
		levels = nil
	}
	// Accept levels as query params too: ?level=3.0&level=3.5
	if len(levels) == 0 {
		levels = c.QueryParams()["level"]
	}
	if len(levels) == 0 {
		return c.JSON(http.StatusOK, []interface{}{})
	}
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT u.id, u.first_name||' '||u.last_name, u.email, COALESCE(u.usta_ranking,'')
		FROM users u
		WHERE u.usta_ranking = ANY($1) AND u.status = 'active'
		  AND NOT EXISTS (SELECT 1 FROM liveball_invitations li WHERE li.event_id=$2 AND li.user_id=u.id)
		ORDER BY u.first_name, u.last_name`, levels, eventID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not preview")
	}
	defer rows.Close()
	type row struct {
		UserID string `json:"user_id"`
		Name   string `json:"name"`
		Email  string `json:"email"`
		USTA   string `json:"usta_ranking"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		rows.Scan(&r.UserID, &r.Name, &r.Email, &r.USTA)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// AdminRemovePlayer removes a confirmed or waitlisted player and promotes the next waitlisted player.
func (h *LiveballHandler) AdminRemovePlayer(c echo.Context) error {
	eventID := c.Param("id")
	userID := c.Param("userId")
	ctx := c.Request().Context()

	// Get current status
	var status string
	err := h.DB.QueryRow(ctx,
		`SELECT status FROM liveball_invitations WHERE event_id=$1 AND user_id=$2`,
		eventID, userID,
	).Scan(&status)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "invitation not found")
	}

	// Cancel the invitation
	h.DB.Exec(ctx,
		`UPDATE liveball_invitations SET status='cancelled' WHERE event_id=$1 AND user_id=$2`,
		eventID, userID)

	// If they were confirmed, promote the next waitlisted player
	if status == "confirmed" {
		h.promoteWaitlisted(ctx, eventID)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "cancelled"})
}

// AdminCancelEvent cancels the entire event and notifies all confirmed players.
func (h *LiveballHandler) AdminCancelEvent(c echo.Context) error {
	eventID := c.Param("id")
	ctx := c.Request().Context()

	var title, startStr string
	h.DB.QueryRow(ctx, `SELECT title, to_char(start_time,'Mon DD at HH12:MI AM') FROM events WHERE id=$1`, eventID).
		Scan(&title, &startStr)

	// Get all confirmed/waitlisted players to notify
	rows, _ := h.DB.Query(ctx, `
		SELECT u.email, u.first_name||' '||u.last_name
		FROM liveball_invitations li
		JOIN users u ON u.id = li.user_id
		WHERE li.event_id=$1 AND li.status IN ('confirmed','waitlisted')`, eventID)
	defer rows.Close()
	for rows.Next() {
		var email, name string
		rows.Scan(&email, &name)
		go h.sendCancellationEmail(email, name, title, startStr)
	}

	// Cancel all invitations and delete event
	h.DB.Exec(ctx, `DELETE FROM events WHERE id=$1`, eventID)
	return c.NoContent(http.StatusNoContent)
}

// ─────────────────────────────────────────────
// Public / token endpoint
// ─────────────────────────────────────────────

// Respond handles accept or decline via a token link.
func (h *LiveballHandler) Respond(c echo.Context) error {
	token := c.Param("token")
	action := c.Param("action") // "accept" | "decline"
	ctx := context.Background()

	// Look up invitation
	var invID, eventID, userID, name, email, currentStatus string
	err := h.DB.QueryRow(ctx, `
		SELECT li.id, li.event_id, li.user_id,
		       u.first_name||' '||u.last_name, u.email, li.status
		FROM liveball_invitations li
		JOIN users u ON u.id = li.user_id
		WHERE li.token = $1`, token,
	).Scan(&invID, &eventID, &userID, &name, &email, &currentStatus)
	if err != nil {
		// Return 200 so the frontend can show a user-friendly message
		// rather than the generic catch-all error banner.
		return c.JSON(http.StatusOK, map[string]string{
			"status":  "not_found",
			"message": "This invitation link was not found. It may have already been used or the link may be incorrect.",
		})
	}
	if currentStatus != "invited" {
		return c.JSON(http.StatusOK, map[string]string{"status": currentStatus, "message": "You already " + pastTense(currentStatus) + " this invitation."})
	}

	// Load event
	var title, startStr string
	var maxPlayers int
	h.DB.QueryRow(ctx,
		`SELECT title, to_char(start_time,'Mon DD at HH12:MI AM'), COALESCE(max_players,0) FROM events WHERE id=$1`, eventID,
	).Scan(&title, &startStr, &maxPlayers)

	if action == "decline" {
		h.DB.Exec(ctx, `UPDATE liveball_invitations SET status='declined', responded_at=NOW() WHERE id=$1`, invID)
		// Notify admin
		go h.notifyAdminDecline(ctx, eventID, name, title, startStr)
		return c.JSON(http.StatusOK, map[string]string{"status": "declined"})
	}

	// Accept — use a transaction to enforce first-come-first-served
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "db error")
	}
	defer tx.Rollback(ctx)

	var confirmed int
	tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM liveball_invitations WHERE event_id=$1 AND status='confirmed' FOR UPDATE`,
		eventID,
	).Scan(&confirmed)

	newStatus := "waitlisted"
	var position *int
	if confirmed < maxPlayers {
		pos := confirmed + 1
		position = &pos
		newStatus = "confirmed"
	}

	tx.Exec(ctx, `
		UPDATE liveball_invitations
		SET status=$1, position=$2, responded_at=NOW()
		WHERE id=$3`, newStatus, position, invID)

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save response")
	}

	// Send confirmation or waitlist email
	if newStatus == "confirmed" {
		go h.sendConfirmedEmail(email, name, title, startStr, *position)
		go h.notifyAdminAccept(ctx, eventID, name, title, startStr, "confirmed", confirmed+1, maxPlayers)
	} else {
		go h.sendWaitlistedEmail(email, name, title, startStr)
		go h.notifyAdminAccept(ctx, eventID, name, title, startStr, "waitlisted", confirmed, maxPlayers)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
}

// GetMyInvitations returns the current user's pending liveball invitations.
func (h *LiveballHandler) GetMyInvitations(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT li.id, li.event_id, e.title,
		       to_char(e.start_time,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(e.max_players,0),
		       li.status, li.position, li.token,
		       to_char(li.invited_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM liveball_invitations li
		JOIN events e ON e.id = li.event_id
		WHERE li.user_id = $1
		  AND e.start_time >= NOW() - INTERVAL '1 day'
		ORDER BY e.start_time`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch invitations")
	}
	defer rows.Close()
	type myInv struct {
		ID         string  `json:"id"`
		EventID    string  `json:"event_id"`
		Title      string  `json:"title"`
		StartTime  string  `json:"start_time"`
		MaxPlayers int     `json:"max_players"`
		Status     string  `json:"status"`
		Position   *int    `json:"position"`
		Token      string  `json:"token"`
		InvitedAt  string  `json:"invited_at"`
	}
	out := []myInv{}
	for rows.Next() {
		var inv myInv
		rows.Scan(&inv.ID, &inv.EventID, &inv.Title, &inv.StartTime, &inv.MaxPlayers,
			&inv.Status, &inv.Position, &inv.Token, &inv.InvitedAt)
		out = append(out, inv)
	}
	return c.JSON(http.StatusOK, out)
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

func (h *LiveballHandler) promoteWaitlisted(ctx context.Context, eventID string) {
	// Find the first waitlisted player (earliest responded_at)
	var invID, userEmail, userName, token string
	var pos int
	err := h.DB.QueryRow(ctx, `
		SELECT li.id, u.email, u.first_name||' '||u.last_name, li.token,
		       (SELECT COUNT(*)+1 FROM liveball_invitations WHERE event_id=$1 AND status='confirmed')
		FROM liveball_invitations li
		JOIN users u ON u.id = li.user_id
		WHERE li.event_id=$1 AND li.status='waitlisted'
		ORDER BY li.responded_at ASC
		LIMIT 1`, eventID,
	).Scan(&invID, &userEmail, &userName, &token, &pos)
	if err != nil {
		return // No one on waitlist
	}

	h.DB.Exec(ctx,
		`UPDATE liveball_invitations SET status='confirmed', position=$1 WHERE id=$2`, pos, invID)

	var title, startStr string
	h.DB.QueryRow(ctx, `SELECT title, to_char(start_time,'Mon DD at HH12:MI AM') FROM events WHERE id=$1`, eventID).
		Scan(&title, &startStr)

	go h.sendSpotOpenedEmail(userEmail, userName, title, startStr)
}

func countByStatus(invs []liveballInvite, status string) int {
	n := 0
	for _, inv := range invs {
		if inv.Status == status {
			n++
		}
	}
	return n
}

func pastTense(status string) string {
	switch status {
	case "confirmed":
		return "confirmed"
	case "waitlisted":
		return "are on the waitlist for"
	case "declined":
		return "declined"
	case "cancelled":
		return "had a cancelled invitation for"
	}
	return "responded to"
}

// ─────────────────────────────────────────────
// Emails
// ─────────────────────────────────────────────

func (h *LiveballHandler) sendInviteEmail(to, name, title, startStr string, maxPlayers int, acceptURL, declineURL string) {
	if h.Mailer == nil {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 You're Invited to %s</h2>
  <p>Hi %s,</p>
  <p>You've been invited to a LiveBall session at Liveoaks Tennis Club:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">👥 <strong>%d player spots available</strong></div>
  </div>
  <p><strong>Spots fill up fast — first to respond gets in!</strong></p>
  <div style="margin:24px 0">
    <a href="%s" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✓ I'm In!</a>
    &nbsp;&nbsp;
    <a href="%s" style="background:#6b7280;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✗ Can't Make It</a>
  </div>
  <p style="color:#9ca3af;font-size:12px">If spots fill up before you respond, you'll be placed on the waitlist.</p>
</div>`, title, name, startStr, maxPlayers, acceptURL, declineURL)
	h.Mailer.Send(to, "You're invited to "+title+"!", body)
}

func (h *LiveballHandler) sendConfirmedEmail(to, name, title, startStr string, position int) {
	if h.Mailer == nil {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">✅ You're In! Spot #%d Confirmed</h2>
  <p>Hi %s,</p>
  <p>You've secured a spot for <strong>%s</strong>!</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">🏆 <strong>You are player #%d on the roster</strong></div>
  </div>
  <p>See you on the court!</p>
  <a href="%s/events" style="color:#15803d">View event details →</a>
</div>`, position, name, title, startStr, position, h.SiteURL)
	h.Mailer.Send(to, "You're confirmed for "+title+"!", body)
}

func (h *LiveballHandler) sendWaitlistedEmail(to, name, title, startStr string) {
	if h.Mailer == nil {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#d97706">⏳ You're on the Waitlist</h2>
  <p>Hi %s,</p>
  <p>Thanks for responding! Unfortunately all spots for <strong>%s</strong> were filled just before your response.</p>
  <div style="background:#fefce8;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #fde68a">
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">You're on the <strong>waitlist</strong></div>
  </div>
  <p>We'll email you immediately if a spot opens up. Fingers crossed!</p>
</div>`, name, title, startStr)
	h.Mailer.Send(to, "You're on the waitlist for "+title, body)
}

func (h *LiveballHandler) sendSpotOpenedEmail(to, name, title, startStr string) {
	if h.Mailer == nil {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎉 A Spot Just Opened Up!</h2>
  <p>Hi %s,</p>
  <p>Great news — a spot has opened for <strong>%s</strong> and you've been moved from the waitlist to the confirmed roster!</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">✅ <strong>Your spot is confirmed!</strong></div>
  </div>
  <p>See you on the court!</p>
</div>`, name, title, startStr)
	h.Mailer.Send(to, "Your spot for "+title+" is confirmed!", body)
}

func (h *LiveballHandler) sendCancellationEmail(to, name, title, startStr string) {
	if h.Mailer == nil {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">❌ Event Cancelled</h2>
  <p>Hi %s,</p>
  <p>We're sorry to let you know that <strong>%s</strong> (%s) has been cancelled.</p>
  <p>We apologise for any inconvenience. Keep an eye out for future LiveBall sessions!</p>
</div>`, name, title, startStr)
	h.Mailer.Send(to, title+" has been cancelled", body)
}

func (h *LiveballHandler) notifyAdminAccept(ctx context.Context, eventID, playerName, title, startStr, status string, confirmed, maxPlayers int) {
	// Get all board member emails to notify
	rows, _ := h.DB.Query(ctx, `
		SELECT email FROM users WHERE role IN ('admin','president','vice_president','entertainment') AND status='active'`)
	if rows == nil {
		return
	}
	defer rows.Close()
	statusMsg := "confirmed"
	if status == "waitlisted" {
		statusMsg = "added to waitlist"
	}
	subject := fmt.Sprintf("%s %s for %s (%d/%d confirmed)", playerName, statusMsg, title, confirmed, maxPlayers)
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <p><strong>%s</strong> has <strong>%s</strong>.</p>
  <p>%s — %s</p>
  <p>Confirmed: %d / %d</p>
  <a href="%s/admin/liveball" style="color:#15803d">Manage event →</a>
</div>`, playerName, statusMsg, title, startStr, confirmed, maxPlayers, h.SiteURL)
	for rows.Next() {
		var email string
		rows.Scan(&email)
		e := email
		go h.Mailer.Send(e, subject, body)
	}
}

func (h *LiveballHandler) notifyAdminDecline(ctx context.Context, eventID, playerName, title, startStr string) {
	rows, _ := h.DB.Query(ctx, `
		SELECT email FROM users WHERE role IN ('admin','president','vice_president','entertainment') AND status='active'`)
	if rows == nil {
		return
	}
	defer rows.Close()
	subject := fmt.Sprintf("%s declined %s", playerName, title)
	body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <p><strong>%s</strong> has declined their invitation to <strong>%s</strong> (%s).</p>
  <a href="%s/admin/liveball" style="color:#15803d">Manage event →</a>
</div>`, playerName, title, startStr, h.SiteURL)
	for rows.Next() {
		var email string
		rows.Scan(&email)
		e := email
		go h.Mailer.Send(e, subject, body)
	}
}
