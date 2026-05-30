package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type InvitationsHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface {
		Send(to, subject, body string) error
	}
	SiteURL string
}

type Invitation struct {
	ID             string     `json:"id"`
	BookingID      string     `json:"booking_id"`
	InviterID      string     `json:"inviter_id"`
	InviteeUserID  *string    `json:"invitee_user_id,omitempty"`
	InviteeName    string     `json:"invitee_name"`
	InviteeEmail   string     `json:"invitee_email"`
	Status         string     `json:"status"`
	IsGuest        bool       `json:"is_guest"`
	RespondedAt    *time.Time `json:"responded_at,omitempty"`
	ExpiresAt      time.Time  `json:"expires_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

type MatchPlayer struct {
	ID          string    `json:"id"`
	PlayerName  string    `json:"player_name"`
	PlayerEmail *string   `json:"player_email,omitempty"`
	IsGuest     bool      `json:"is_guest"`
	IsHost      bool      `json:"is_host"`
	AddedAt     time.Time `json:"added_at"`
}

// GetRoster returns all players and invitations for a booking
func (h *InvitationsHandler) GetRoster(c echo.Context) error {
	bookingID := c.Param("id")

	prows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, player_name, player_email, is_guest, is_host, added_at
		FROM match_players WHERE booking_id = $1 ORDER BY is_host DESC, added_at`, bookingID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch roster")
	}
	defer prows.Close()
	players := []MatchPlayer{}
	for prows.Next() {
		var p MatchPlayer
		if err := prows.Scan(&p.ID, &p.PlayerName, &p.PlayerEmail, &p.IsGuest, &p.IsHost, &p.AddedAt); err != nil {
			continue
		}
		players = append(players, p)
	}

	irows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, booking_id, inviter_id, invitee_user_id, invitee_name, invitee_email,
		       status, is_guest, responded_at, expires_at, created_at
		FROM match_invitations WHERE booking_id = $1 ORDER BY created_at`, bookingID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch invitations")
	}
	defer irows.Close()
	invitations := []Invitation{}
	for irows.Next() {
		var inv Invitation
		if err := irows.Scan(&inv.ID, &inv.BookingID, &inv.InviterID, &inv.InviteeUserID,
			&inv.InviteeName, &inv.InviteeEmail, &inv.Status, &inv.IsGuest,
			&inv.RespondedAt, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			continue
		}
		invitations = append(invitations, inv)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"players":     players,
		"invitations": invitations,
	})
}

// Send creates and sends an invitation
func (h *InvitationsHandler) Send(c echo.Context) error {
	inviterID := c.Get("user_id").(string)
	bookingID := c.Param("id")

	var req struct {
		InviteeUserID *string `json:"invitee_user_id"`
		InviteeName   string  `json:"invitee_name"`
		InviteeEmail  string  `json:"invitee_email"`
		IsGuest       bool    `json:"is_guest"`
	}
	if err := c.Bind(&req); err != nil || req.InviteeEmail == "" || req.InviteeName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and email required")
	}

	// Get booking details
	var courtName, inviterName, startTime, endTime string
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT ct.name, u.first_name || ' ' || u.last_name,
		       b.start_time::text, b.end_time::text
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		JOIN users u ON u.id = b.user_id
		WHERE b.id = $1`, bookingID,
	).Scan(&courtName, &inviterName, &startTime, &endTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}

	// Generate unique token
	b := make([]byte, 20)
	rand.Read(b)
	token := hex.EncodeToString(b)

	var inv Invitation
	err = h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO match_invitations
		  (booking_id, inviter_id, invitee_user_id, invitee_name, invitee_email, token, is_guest)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, booking_id, inviter_id, invitee_user_id, invitee_name, invitee_email,
		          status, is_guest, responded_at, expires_at, created_at`,
		bookingID, inviterID, req.InviteeUserID, req.InviteeName, req.InviteeEmail, token, req.IsGuest,
	).Scan(&inv.ID, &inv.BookingID, &inv.InviterID, &inv.InviteeUserID,
		&inv.InviteeName, &inv.InviteeEmail, &inv.Status, &inv.IsGuest,
		&inv.RespondedAt, &inv.ExpiresAt, &inv.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create invitation")
	}

	// Send email async
	acceptURL := fmt.Sprintf("%s/invite/%s/accept", h.SiteURL, token)
	declineURL := fmt.Sprintf("%s/invite/%s/decline", h.SiteURL, token)
	go h.sendInvitationEmail(req.InviteeEmail, req.InviteeName, inviterName, courtName, startTime, endTime, acceptURL, declineURL)

	return c.JSON(http.StatusCreated, inv)
}

// Respond handles accept/decline via token (public endpoint)
func (h *InvitationsHandler) Respond(c echo.Context) error {
	token := c.Param("token")
	action := c.Param("action") // "accept" or "decline"

	var inv Invitation
	var inviterEmail, bookingID string
	err := h.DB.QueryRow(context.Background(), `
		SELECT i.id, i.booking_id, i.inviter_id, i.invitee_user_id, i.invitee_name,
		       i.invitee_email, i.status, i.is_guest, i.expires_at,
		       u.email as inviter_email
		FROM match_invitations i
		JOIN users u ON u.id = i.inviter_id
		WHERE i.token = $1`, token,
	).Scan(&inv.ID, &bookingID, &inv.InviterID, &inv.InviteeUserID, &inv.InviteeName,
		&inv.InviteeEmail, &inv.Status, &inv.IsGuest, &inv.ExpiresAt, &inviterEmail)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "Invitation not found or already responded."})
	}

	if inv.Status != "pending" {
		return c.JSON(http.StatusOK, map[string]string{"status": inv.Status, "message": "This invitation has already been " + inv.Status + "."})
	}
	if time.Now().After(inv.ExpiresAt) {
		h.DB.Exec(context.Background(), `UPDATE match_invitations SET status='expired' WHERE id=$1`, inv.ID)
		return c.JSON(http.StatusGone, map[string]string{"error": "This invitation has expired."})
	}

	newStatus := "declined"
	if action == "accept" {
		newStatus = "accepted"
	}

	h.DB.Exec(context.Background(),
		`UPDATE match_invitations SET status=$1, responded_at=NOW() WHERE id=$2`, newStatus, inv.ID)

	if action == "accept" {
		// Add to roster
		h.DB.Exec(context.Background(), `
			INSERT INTO match_players (booking_id, invitation_id, user_id, player_name, player_email, is_guest)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			bookingID, inv.ID, inv.InviteeUserID, inv.InviteeName, inv.InviteeEmail, inv.IsGuest)

		// Notify host
		go h.sendAcceptedEmail(inviterEmail, inv.InviteeName)

		// Check if match is now full and cancel remaining
		go h.checkMatchFull(bookingID, inv.InviterID, inviterEmail)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
}

// AddPlayer adds a player directly to the roster (no invite email needed)
func (h *InvitationsHandler) AddPlayer(c echo.Context) error {
	userID := c.Get("user_id").(string)
	bookingID := c.Param("id")

	// Only the host (or board) may add players directly
	var hostID string
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT user_id FROM bookings WHERE id = $1`, bookingID).Scan(&hostID); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}
	role, _ := c.Get("role").(string)
	if hostID != userID && role != "admin" && role != "board" {
		return echo.NewHTTPError(http.StatusForbidden, "only the host can add players")
	}

	var req struct {
		UserID      *string `json:"user_id"`
		PlayerName  string  `json:"player_name"`
		PlayerEmail string  `json:"player_email"`
		IsGuest     bool    `json:"is_guest"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	// If a member user_id is given, resolve name/email from DB
	if req.UserID != nil && *req.UserID != "" {
		var first, last, email string
		h.DB.QueryRow(c.Request().Context(),
			`SELECT first_name, last_name, email FROM users WHERE id = $1`, *req.UserID,
		).Scan(&first, &last, &email)
		if first != "" {
			req.PlayerName = first + " " + last
			req.PlayerEmail = email
		}
	}

	if req.PlayerName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "player name required")
	}

	var p MatchPlayer
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO match_players (booking_id, user_id, player_name, player_email, is_guest)
		VALUES ($1, $2, $3, NULLIF($4,''), $5)
		RETURNING id, player_name, player_email, is_guest, is_host, added_at`,
		bookingID, req.UserID, req.PlayerName, req.PlayerEmail, req.IsGuest,
	).Scan(&p.ID, &p.PlayerName, &p.PlayerEmail, &p.IsGuest, &p.IsHost, &p.AddedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add player")
	}
	return c.JSON(http.StatusCreated, p)
}

// RemovePlayer removes a non-host player from the roster
func (h *InvitationsHandler) RemovePlayer(c echo.Context) error {
	userID := c.Get("user_id").(string)
	bookingID := c.Param("id")
	playerID := c.Param("playerId")

	var hostID string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT user_id FROM bookings WHERE id = $1`, bookingID).Scan(&hostID)

	role, _ := c.Get("role").(string)
	if hostID != userID && role != "admin" && role != "board" {
		return echo.NewHTTPError(http.StatusForbidden, "only the host can remove players")
	}

	h.DB.Exec(c.Request().Context(),
		`DELETE FROM match_players WHERE id=$1 AND booking_id=$2 AND is_host=false`,
		playerID, bookingID)
	return c.NoContent(http.StatusNoContent)
}

// Cancel an invitation (by inviter)
func (h *InvitationsHandler) Cancel(c echo.Context) error {
	inviterID := c.Get("user_id").(string)
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(),
		`UPDATE match_invitations SET status='cancelled', responded_at=NOW()
		 WHERE id=$1 AND inviter_id=$2 AND status='pending'`, id, inviterID)
	return c.NoContent(http.StatusNoContent)
}

func (h *InvitationsHandler) checkMatchFull(bookingID, inviterID, inviterEmail string) {
	var playersNeeded, confirmedCount int
	h.DB.QueryRow(context.Background(),
		`SELECT b.players_needed,
		        (SELECT COUNT(*) FROM match_players WHERE booking_id = b.id) as confirmed
		 FROM bookings b WHERE b.id = $1`, bookingID,
	).Scan(&playersNeeded, &confirmedCount)

	if playersNeeded > 0 && confirmedCount >= playersNeeded+1 {
		// Cancel remaining pending invitations and notify them
		rows, _ := h.DB.Query(context.Background(),
			`UPDATE match_invitations SET status='cancelled', responded_at=NOW()
			 WHERE booking_id=$1 AND status='pending'
			 RETURNING invitee_name, invitee_email`, bookingID)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var name, email string
				rows.Scan(&name, &email)
				go h.sendMatchFullEmail(email, name)
			}
		}
		// Notify host match is full
		go h.sendMatchFullHostEmail(inviterEmail)
	}
}

func (h *InvitationsHandler) sendInvitationEmail(to, toName, fromName, court, start, end, acceptURL, declineURL string) {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 You're Invited to Play Tennis!</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has invited you to a match at Liveoaks Tennis Club:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">⏱ Until %s</div>
  </div>
  <div style="margin:24px 0;display:flex;gap:12px">
    <a href="%s" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✓ Accept</a>
    &nbsp;&nbsp;
    <a href="%s" style="background:#6b7280;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✗ Decline</a>
  </div>
  <p style="color:#9ca3af;font-size:12px">This invitation expires in 7 days.</p>
</div>`, toName, fromName, court, start, end, acceptURL, declineURL)
	h.Mailer.Send(to, fmt.Sprintf("%s invited you to play at Liveoaks!", fromName), body)
}

func (h *InvitationsHandler) sendAcceptedEmail(to, playerName string) {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">✓ Invitation Accepted</h2>
  <p><strong>%s</strong> has accepted your match invitation and is now on the roster.</p>
  <a href="%s/bookings" style="color:#15803d">View your booking →</a>
</div>`, playerName, h.SiteURL)
	h.Mailer.Send(to, playerName+" accepted your match invitation", body)
}

func (h *InvitationsHandler) sendMatchFullEmail(to, name string) {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Match is Full</h2>
  <p>Hi %s,</p>
  <p>The match you were invited to at Liveoaks Tennis Club is now full. Your invitation has been cancelled.</p>
</div>`, name)
	h.Mailer.Send(to, "Match is full — Liveoaks Tennis Club", body)
}

func (h *InvitationsHandler) sendMatchFullHostEmail(to string) {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Your Match is Full!</h2>
  <p>All player spots have been filled. Remaining pending invitations have been automatically cancelled.</p>
  <a href="%s/bookings" style="color:#15803d">View your booking →</a>
</div>`, h.SiteURL)
	h.Mailer.Send(to, "Your match is full!", body)
}
