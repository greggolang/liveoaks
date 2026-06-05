package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
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
	UserID      *string   `json:"user_id,omitempty"`
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
		SELECT id, user_id, player_name, player_email, is_guest, is_host, added_at
		FROM match_players
		WHERE booking_id = $1 AND withdrew_at IS NULL
		ORDER BY is_host DESC, added_at`, bookingID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch roster")
	}
	defer prows.Close()
	players := []MatchPlayer{}
	for prows.Next() {
		var p MatchPlayer
		if err := prows.Scan(&p.ID, &p.UserID, &p.PlayerName, &p.PlayerEmail, &p.IsGuest, &p.IsHost, &p.AddedAt); err != nil {
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

	// Resolve invitee_user_id from email when not supplied (e.g. family-member path)
	if (req.InviteeUserID == nil || *req.InviteeUserID == "") && req.InviteeEmail != "" {
		var resolvedID string
		if err := h.DB.QueryRow(c.Request().Context(),
			`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, req.InviteeEmail,
		).Scan(&resolvedID); err == nil && resolvedID != "" {
			req.InviteeUserID = &resolvedID
		}
	}

	// Block re-invitation of a player who is already pending or has declined
	var existing int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM match_invitations
		 WHERE booking_id = $1 AND LOWER(invitee_email) = LOWER($2) AND status IN ('pending','declined')`,
		bookingID, req.InviteeEmail).Scan(&existing)
	if existing > 0 {
		return echo.NewHTTPError(http.StatusConflict, "this player has already been invited or has declined")
	}

	// Block re-inviting a player who already withdrew from this booking
	var withdrew int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM match_players
		 WHERE booking_id = $1 AND player_email = $2 AND withdrew_at IS NOT NULL`,
		bookingID, req.InviteeEmail).Scan(&withdrew)
	if withdrew > 0 {
		return echo.NewHTTPError(http.StatusConflict, "this player has already withdrawn from this booking")
	}

	// Get booking details
	var courtName, inviterName, matchType string
	var startTime, endTime time.Time
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT ct.name, u.first_name || ' ' || u.last_name,
		       b.start_time, b.end_time, b.match_type
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		JOIN users u ON u.id = b.user_id
		WHERE b.id = $1`, bookingID,
	).Scan(&courtName, &inviterName, &startTime, &endTime, &matchType)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}
	loc := loadTimezone(c.Request().Context(), h.DB)
	startStr := startTime.In(loc).Format("Mon Jan 2 at 3:04 PM MST")
	endStr := endTime.In(loc).Format("3:04 PM MST")
	matchTypeLabels := map[string]string{
		"singles": "Singles", "doubles": "Doubles",
		"casual": "Hit Session", "ball_machine": "Ball Machine",
		"teaching_pro": "Teaching Pro",
	}
	matchTypeLabel := matchTypeLabels[matchType]
	if matchTypeLabel == "" {
		matchTypeLabel = "Tennis Match"
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

	// Send email async — skip if registered member opted out of match invitations
	acceptURL := fmt.Sprintf("%s/invite/%s/accept", h.SiteURL, token)
	declineURL := fmt.Sprintf("%s/invite/%s/decline", h.SiteURL, token)
	wantsEmail := req.InviteeUserID == nil || notifprefs.UserWantsEmail(context.Background(), h.DB, *req.InviteeUserID, "match_invitation")
	if wantsEmail {
		go h.sendInvitationEmail(req.InviteeEmail, req.InviteeName, inviterName, courtName, matchTypeLabel, startStr, endStr, acceptURL, declineURL)
	}

	return c.JSON(http.StatusCreated, inv)
}

// Respond handles accept/decline via token (public endpoint)
func (h *InvitationsHandler) Respond(c echo.Context) error {
	token := c.Param("token")
	action := c.Param("action") // "accept" or "decline"

	var inv Invitation
	var inviterEmail, bookingID, courtName string
	var bookingStart time.Time
	err := h.DB.QueryRow(context.Background(), `
		SELECT i.id, i.booking_id, i.inviter_id, i.invitee_user_id, i.invitee_name,
		       i.invitee_email, i.status, i.is_guest, i.expires_at,
		       u.email, ct.name, b.start_time
		FROM match_invitations i
		JOIN users u ON u.id = i.inviter_id
		JOIN bookings b ON b.id = i.booking_id
		JOIN courts ct ON ct.id = b.court_id
		WHERE i.token = $1`, token,
	).Scan(&inv.ID, &bookingID, &inv.InviterID, &inv.InviteeUserID, &inv.InviteeName,
		&inv.InviteeEmail, &inv.Status, &inv.IsGuest, &inv.ExpiresAt, &inviterEmail,
		&courtName, &bookingStart)
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

	loc := loadTimezone(context.Background(), h.DB)
	dateStr := bookingStart.In(loc).Format("Mon Jan 2 at 3:04 PM MST")

	if action == "accept" {
		// Add to roster
		h.DB.Exec(context.Background(), `
			INSERT INTO match_players (booking_id, invitation_id, user_id, player_name, player_email, is_guest)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			bookingID, inv.ID, inv.InviteeUserID, inv.InviteeName, inv.InviteeEmail, inv.IsGuest)

		// Notify host
		go h.sendAcceptedEmail(inviterEmail, inv.InviteeName, courtName, dateStr, bookingID)

		// Check if match is now full and cancel remaining
		go h.checkMatchFull(bookingID, inv.InviterID, inviterEmail)
	} else {
		// Notify host of decline
		go h.sendDeclinedEmail(inviterEmail, inv.InviteeName, courtName, dateStr, bookingID)
	}

	return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
}

// AddPlayer adds a player directly to the roster and emails them a notification.
func (h *InvitationsHandler) AddPlayer(c echo.Context) error {
	userID := c.Get("user_id").(string)
	bookingID := c.Param("id")

	// Only the host (or board) may add players directly
	var hostID, courtName, hostName string
	var bookingStart, bookingEnd time.Time
	var matchType string
	if err := h.DB.QueryRow(c.Request().Context(), `
		SELECT b.user_id, b.start_time, b.end_time, b.match_type,
		       ct.name,
		       u.first_name || ' ' || u.last_name
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		JOIN users u ON u.id = b.user_id
		WHERE b.id = $1`, bookingID,
	).Scan(&hostID, &bookingStart, &bookingEnd, &matchType, &courtName, &hostName); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}
	role, _ := c.Get("role").(string)
	if hostID != userID && role != "admin" && role != "board" {
		return echo.NewHTTPError(http.StatusForbidden, "only the host can add players")
	}

	var req struct {
		UserID         *string `json:"user_id"`
		FamilyMemberID *string `json:"family_member_id"`
		PlayerName     string  `json:"player_name"`
		PlayerEmail    string  `json:"player_email"`
		IsGuest        bool    `json:"is_guest"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	// Prevent the host from adding themselves
	if req.UserID != nil && *req.UserID == hostID {
		return echo.NewHTTPError(http.StatusBadRequest, "you are already on this booking as the host")
	}

	// Family member path — validate ownership and eligibility server-side
	if req.FamilyMemberID != nil && *req.FamilyMemberID != "" {
		var famFirst, famLast, famEmail, famOwnerID, famRelationship string
		var famBirthday *time.Time
		var famLinkedUserID *string
		if err := h.DB.QueryRow(c.Request().Context(), `
			SELECT first_name, last_name, COALESCE(email,''), user_id, LOWER(relationship), birthday, linked_user_id::text
			FROM family_members WHERE id = $1`, *req.FamilyMemberID,
		).Scan(&famFirst, &famLast, &famEmail, &famOwnerID, &famRelationship, &famBirthday, &famLinkedUserID); err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "family member not found")
		}
		if famOwnerID != hostID {
			return echo.NewHTTPError(http.StatusForbidden, "that family member does not belong to this booking's host")
		}
		if famRelationship != "spouse" {
			if famBirthday == nil {
				return echo.NewHTTPError(http.StatusBadRequest, "family member has no birthday on file — add a birthday first to confirm eligibility")
			}
			ageYears := time.Since(*famBirthday).Hours() / (365.25 * 24)
			if ageYears >= 26 {
				return echo.NewHTTPError(http.StatusBadRequest, "only spouses and family members under 26 can be added without a guest fee")
			}
		}
		req.PlayerName = famFirst + " " + famLast
		req.PlayerEmail = famEmail
		req.IsGuest = false // spouse or under-26 family member — treated as member, no guest fee
		// Link the family member's login account so they can manage their own roster slot.
		if famLinkedUserID != nil && *famLinkedUserID != "" {
			req.UserID = famLinkedUserID
		}
	}

	// Block re-adding a player who already withdrew from this booking
	if req.UserID != nil && *req.UserID != "" {
		var withdrawn int
		h.DB.QueryRow(c.Request().Context(),
			`SELECT COUNT(*) FROM match_players WHERE booking_id = $1 AND user_id = $2 AND withdrew_at IS NOT NULL`,
			bookingID, *req.UserID).Scan(&withdrawn)
		if withdrawn > 0 {
			return echo.NewHTTPError(http.StatusConflict, "this player has already withdrawn from this booking")
		}
	}

	// Enforce player capacity by match type
	maxPlayers := map[string]int{
		"casual": 2, "singles": 2, "doubles": 4, "ball_machine": 1, "teaching_pro": 16, // group lessons
	}[matchType]
	if maxPlayers > 0 {
		var playerCount int
		h.DB.QueryRow(c.Request().Context(),
			`SELECT COUNT(*) FROM match_players WHERE booking_id = $1 AND withdrew_at IS NULL`, bookingID,
		).Scan(&playerCount)
		if playerCount >= maxPlayers {
			return echo.NewHTTPError(http.StatusBadRequest, "this booking is already full")
		}
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

	// Auto-log the guest fee in guest_passes when a guest is added to a booking.
	// Fee rate is read from settings (peak vs off-peak hours).
	if req.IsGuest {
		fee := h.lookupGuestFee(c.Request().Context(), bookingStart)
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO guest_passes (member_id, guest_name, guest_email, visit_date, fee, source, notes)
			 VALUES ($1, $2, NULLIF($3,''), $4::date, $5, 'booking', 'Court booking guest fee')`,
			hostID, req.PlayerName, req.PlayerEmail, bookingStart.Format("2006-01-02"), fee)
	}

	// Email non-guest players who have an email address.
	if !req.IsGuest && req.PlayerEmail != "" && h.Mailer != nil {
		loc := loadTimezone(c.Request().Context(), h.DB)
		card := bookingCard(courtName, bookingStart, bookingEnd, loc)
		matchTypeLabels := map[string]string{
			"singles": "Singles", "doubles": "Doubles",
			"casual": "Hit Session", "ball_machine": "Ball Machine",
		}
		matchLabel := matchTypeLabels[matchType]
		if matchLabel == "" {
			matchLabel = "Tennis"
		}
		playerFirst := req.PlayerName
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 You've Been Added to a Booking</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has added you to a court booking:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">%s
    <div style="margin-top:8px;color:#166534;font-size:14px">%s</div>
  </div>
  <p style="margin-top:4px"><a href="%s/bookings" style="color:#15803d;font-size:13px">View bookings →</a></p>
</div>`, playerFirst, hostName, card, matchLabel, h.SiteURL)
		go h.Mailer.Send(req.PlayerEmail, "You've been added to a booking – "+courtName, body)
	}

	// Dashboard alert for portal members added directly to the roster.
	if req.UserID != nil && *req.UserID != "" && !req.IsGuest {
		loc := loadTimezone(c.Request().Context(), h.DB)
		matchTypeLabels := map[string]string{
			"singles": "Singles", "doubles": "Doubles",
			"casual": "Hit Session", "ball_machine": "Ball Machine",
		}
		matchLabel := matchTypeLabels[matchType]
		if matchLabel == "" {
			matchLabel = "Tennis"
		}
		alertMsg := fmt.Sprintf("%s added you to a booking — %s, %s, %s",
			hostName, courtName, matchLabel, bookingStart.In(loc).Format("Mon Jan 2 at 3:04 PM"))
		if _, err := h.DB.Exec(c.Request().Context(),
			`INSERT INTO member_alerts (user_id, message, type, created_by) VALUES ($1, $2, 'info', $3)`,
			*req.UserID, alertMsg, userID); err != nil {
			log.Printf("add-player alert insert failed for user %s: %v", *req.UserID, err)
		}
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

// Cancel an invitation (by inviter) — only sends an email if the invite was
// still pending at cancel time. Players who already declined are not emailed.
func (h *InvitationsHandler) Cancel(c echo.Context) error {
	inviterID := c.Get("user_id").(string)
	id := c.Param("id")

	// Single atomic UPDATE+RETURNING: only succeeds (and returns data) when the
	// invitation is still pending. If the player already declined, nothing happens.
	var inviteeName, inviteeEmail, courtName, startTime, endTime string
	err := h.DB.QueryRow(c.Request().Context(),
		`UPDATE match_invitations SET status='cancelled', responded_at=NOW()
		 WHERE id=$1 AND inviter_id=$2 AND status='pending'
		 RETURNING invitee_name, invitee_email,
		           (SELECT ct.name FROM courts ct
		            JOIN bookings b ON b.court_id = ct.id
		            WHERE b.id = match_invitations.booking_id),
		           (SELECT b.start_time::text FROM bookings b WHERE b.id = match_invitations.booking_id),
		           (SELECT b.end_time::text   FROM bookings b WHERE b.id = match_invitations.booking_id)`,
		id, inviterID,
	).Scan(&inviteeName, &inviteeEmail, &courtName, &startTime, &endTime)

	if err == nil && inviteeEmail != "" {
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#6b7280">Invitation Cancelled</h2>
  <p>Hi %s,</p>
  <p>Your invitation to play at <strong>%s</strong> (%s – %s) has been cancelled by the host.</p>
</div>`, inviteeName, courtName, startTime, endTime)
		go h.Mailer.Send(inviteeEmail, "Match invitation cancelled – Liveoaks Tennis Club", body)
	}

	return c.NoContent(http.StatusNoContent)
}

// GetResponses returns recent accept/decline responses for bookings the user hosts.
func (h *InvitationsHandler) GetResponses(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT i.id, b.id, i.invitee_name, i.status, ct.name, b.start_time, i.responded_at
		FROM match_invitations i
		JOIN bookings b ON b.id = i.booking_id
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.user_id = $1
		  AND i.status IN ('accepted', 'declined')
		  AND i.responded_at > NOW() - INTERVAL '48 hours'
		ORDER BY i.responded_at DESC
		LIMIT 20`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch responses")
	}
	defer rows.Close()
	type Response struct {
		ID          string    `json:"id"`
		BookingID   string    `json:"booking_id"`
		InviteeName string    `json:"invitee_name"`
		Status      string    `json:"status"`
		CourtName   string    `json:"court_name"`
		StartTime   time.Time `json:"start_time"`
		RespondedAt time.Time `json:"responded_at"`
	}
	results := []Response{}
	for rows.Next() {
		var r Response
		if err := rows.Scan(&r.ID, &r.BookingID, &r.InviteeName, &r.Status, &r.CourtName, &r.StartTime, &r.RespondedAt); err != nil {
			continue
		}
		results = append(results, r)
	}
	return c.JSON(http.StatusOK, results)
}

// GetSentPending returns invitations the current user sent that are still awaiting a response.
func (h *InvitationsHandler) GetSentPending(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT i.id, b.id, i.invitee_name, ct.name, b.start_time, i.created_at
		FROM match_invitations i
		JOIN bookings b ON b.id = i.booking_id
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.user_id = $1
		  AND i.status = 'pending'
		  AND i.expires_at > NOW()
		  AND b.start_time > NOW()
		ORDER BY b.start_time, i.created_at`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch pending invitations")
	}
	defer rows.Close()
	type SentPending struct {
		ID          string    `json:"id"`
		BookingID   string    `json:"booking_id"`
		InviteeName string    `json:"invitee_name"`
		CourtName   string    `json:"court_name"`
		StartTime   time.Time `json:"start_time"`
		SentAt      time.Time `json:"sent_at"`
	}
	results := []SentPending{}
	for rows.Next() {
		var p SentPending
		if err := rows.Scan(&p.ID, &p.BookingID, &p.InviteeName, &p.CourtName, &p.StartTime, &p.SentAt); err != nil { //nolint
			continue
		}
		results = append(results, p)
	}
	return c.JSON(http.StatusOK, results)
}

// GetPendingForMe returns invitations sent to the current user that haven't been responded to.
func (h *InvitationsHandler) GetPendingForMe(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var email string
	if err := h.DB.QueryRow(c.Request().Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch user")
	}

	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT i.id, i.token, ct.name, b.start_time, b.end_time,
		       u.first_name || ' ' || u.last_name
		FROM match_invitations i
		JOIN bookings b ON b.id = i.booking_id
		JOIN courts ct ON ct.id = b.court_id
		JOIN users u ON u.id = b.user_id
		WHERE (i.invitee_user_id = $1 OR LOWER(i.invitee_email) = LOWER($2))
		  AND i.status = 'pending'
		  AND i.expires_at > NOW()
		  AND b.start_time > NOW()
		ORDER BY b.start_time`, userID, email)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch invitations")
	}
	defer rows.Close()

	type PendingInvite struct {
		ID          string    `json:"id"`
		Token       string    `json:"token"`
		CourtName   string    `json:"court_name"`
		StartTime   time.Time `json:"start_time"`
		EndTime     time.Time `json:"end_time"`
		InviterName string    `json:"inviter_name"`
	}
	results := []PendingInvite{}
	for rows.Next() {
		var p PendingInvite
		if err := rows.Scan(&p.ID, &p.Token, &p.CourtName, &p.StartTime, &p.EndTime, &p.InviterName); err != nil {
			continue
		}
		results = append(results, p)
	}
	return c.JSON(http.StatusOK, results)
}

func (h *InvitationsHandler) checkMatchFull(bookingID, inviterID, inviterEmail string) {
	var playersNeeded, confirmedCount int
	h.DB.QueryRow(context.Background(),
		`SELECT b.players_needed,
		        (SELECT COUNT(*) FROM match_players WHERE booking_id = b.id AND withdrew_at IS NULL) as confirmed
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
		go h.sendMatchFullHostEmail(inviterEmail, bookingID)
	}
}

func (h *InvitationsHandler) sendInvitationEmail(to, toName, fromName, court, matchType, start, end, acceptURL, declineURL string) {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 You're Invited to Play Tennis!</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has invited you to a match at Liveoaks Tennis Club:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">⏱ Until %s</div>
  </div>
  <div style="margin:24px 0">
    <a href="%s" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✓ Accept</a>
    &nbsp;&nbsp;
    <a href="%s" style="background:#6b7280;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✗ Decline</a>
  </div>
  <p style="color:#9ca3af;font-size:12px">This invitation expires in 7 days.</p>
</div>`, toName, fromName, court, matchType, start, end, acceptURL, declineURL)
	h.Mailer.Send(to, fmt.Sprintf("%s invited you to play at Liveoaks!", fromName), body)
}

func (h *InvitationsHandler) sendDeclinedEmail(to, playerName, court, dateStr, bookingID string) {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">❌ Invitation Declined</h2>
  <p><strong>%s</strong> has declined your match invitation.</p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
  </div>
  <p>You have an open spot — invite another player to fill the roster.</p>
  <a href="%s/bookings" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px">Invite Someone Else →</a>
</div>`, playerName, court, dateStr, h.SiteURL)
	h.Mailer.Send(to, playerName+" declined your match invitation", body)
}

func (h *InvitationsHandler) sendAcceptedEmail(to, playerName, court, dateStr, bookingID string) {
	// Fetch current roster, capacity, and times
	type rosterRow struct {
		name   string
		isHost bool
	}
	var players []rosterRow
	var playersNeeded int
	var startTime, endTime time.Time
	var matchType string

	rows, err := h.DB.Query(context.Background(), `
		SELECT mp.player_name, mp.is_host
		FROM match_players mp
		WHERE mp.booking_id = $1 AND mp.withdrew_at IS NULL
		ORDER BY mp.is_host DESC, mp.added_at`, bookingID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var r rosterRow
			rows.Scan(&r.name, &r.isHost)
			players = append(players, r)
		}
	}
	h.DB.QueryRow(context.Background(),
		`SELECT players_needed, start_time, end_time, COALESCE(match_type,'casual')
		 FROM bookings WHERE id = $1`, bookingID,
	).Scan(&playersNeeded, &startTime, &endTime, &matchType)

	// Roster list HTML
	rosterHTML := ""
	for _, p := range players {
		label := p.name
		if p.isHost {
			label += " (Host)"
		}
		rosterHTML += fmt.Sprintf(`<li style="margin:4px 0">%s</li>`, label)
	}

	// Still-needed section
	spotsLeft := playersNeeded + 1 - len(players) // +1 because players_needed excludes host
	var spotsHTML string
	if spotsLeft <= 0 {
		spotsHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:16px 0;color:#166534;font-weight:600">
  ✅ Your roster is full — you're all set!
</div>`
	} else {
		spotsHTML = fmt.Sprintf(`<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:12px;margin:16px 0;color:#854d0e">
  ⚠️ You still need <strong>%d more player%s</strong> for this match.
</div>
<p style="margin:16px 0">
  <a href="%s/bookings" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
    Invite Someone →
  </a>
</p>`, spotsLeft, map[bool]string{true: "", false: "s"}[spotsLeft == 1], h.SiteURL)
	}

	matchTypeLabels := map[string]string{
		"singles": "Singles", "doubles": "Doubles",
		"casual": "Hit Session", "ball_machine": "Ball Machine",
		"teaching_pro": "Teaching Pro",
	}
	matchLabel := matchTypeLabels[matchType]
	if matchLabel == "" {
		matchLabel = "Tennis"
	}

	// Calendar link — only when roster is complete
	calHTML := ""
	if spotsLeft <= 0 {
		icalURL := fmt.Sprintf("%s/api/bookings/%s/ical", h.SiteURL, bookingID)
		calHTML = calendarLinksHTML(
			fmt.Sprintf("%s – %s – Live Oaks Tennis Club", matchLabel, court),
			fmt.Sprintf("Match Type: %s\nCourt: %s", matchLabel, court),
			startTime, endTime, icalURL,
		)
	}

	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">✓ Invitation Accepted</h2>
  <p><strong>%s</strong> has accepted your match invitation and is now on the roster.</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin-top:12px;font-weight:600;color:#166534">Current Roster:</div>
    <ul style="margin:8px 0;padding-left:20px;color:#374151">%s</ul>
  </div>
  %s
  %s
  <p><a href="%s/bookings" style="color:#15803d;font-size:13px">View all your bookings →</a></p>
</div>`, playerName, court, dateStr, matchLabel, rosterHTML, spotsHTML, calHTML, h.SiteURL)
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

func (h *InvitationsHandler) sendMatchFullHostEmail(to, bookingID string) {
	// Fetch booking details
	var courtName, matchType string
	var startTime, endTime time.Time
	h.DB.QueryRow(context.Background(), `
		SELECT ct.name, COALESCE(b.match_type,'casual'), b.start_time, b.end_time
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.id = $1`, bookingID,
	).Scan(&courtName, &matchType, &startTime, &endTime)

	loc := loadTimezone(context.Background(), h.DB)
	timeStr := startTime.In(loc).Format("Mon Jan 2 at 3:04 PM MST")
	endStr := endTime.In(loc).Format("3:04 PM MST")

	matchTypeLabels := map[string]string{
		"singles": "Singles", "doubles": "Doubles",
		"casual": "Hit Session", "ball_machine": "Ball Machine",
		"teaching_pro": "Teaching Pro",
	}
	matchLabel := matchTypeLabels[matchType]
	if matchLabel == "" {
		matchLabel = "Tennis"
	}

	// Full confirmed roster
	rows, _ := h.DB.Query(context.Background(), `
		SELECT player_name, is_host FROM match_players
		WHERE booking_id = $1 AND withdrew_at IS NULL ORDER BY is_host DESC, added_at`, bookingID)
	rosterHTML := ""
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			var isHost bool
			rows.Scan(&name, &isHost)
			suffix := ""
			if isHost {
				suffix = " (Host)"
			}
			rosterHTML += fmt.Sprintf(`<li style="margin:4px 0">%s%s</li>`, name, suffix)
		}
	}

	icalURL := fmt.Sprintf("%s/api/bookings/%s/ical", h.SiteURL, bookingID)
	calHTML := calendarLinksHTML(
		fmt.Sprintf("%s – %s – Live Oaks Tennis Club", matchLabel, courtName),
		fmt.Sprintf("Match Type: %s\nCourt: %s", matchLabel, courtName),
		startTime, endTime, icalURL,
	)

	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Your Match is Full!</h2>
  <p>All player spots have been filled. Remaining pending invitations have been automatically cancelled.</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:20px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">⏰ <strong>%s – %s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin-top:12px;font-weight:600;color:#166534">Your Roster:</div>
    <ul style="margin:8px 0;padding-left:20px;color:#374151">%s</ul>
  </div>
  %s
  <p><a href="%s/bookings" style="color:#15803d;font-size:13px">View your bookings →</a></p>
</div>`, courtName, timeStr, endStr, matchLabel, rosterHTML, calHTML, h.SiteURL)
	h.Mailer.Send(to, "Your match is full – "+courtName, body)
}

// WithdrawFromBooking lets any roster member remove themselves with a reason.
func (h *InvitationsHandler) WithdrawFromBooking(c echo.Context) error {
	ctx := c.Request().Context()
	userID := c.Get("user_id").(string)
	bookingID := c.Param("id")

	var req struct {
		Reason            string  `json:"reason"`
		TransferToPlayerID *string `json:"transfer_to_player_id"`
	}
	c.Bind(&req)

	var matchType, courtName, bookingHostID string
	var startTime, endTime time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT b.match_type, b.user_id, b.start_time, b.end_time, ct.name
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.id = $1`, bookingID,
	).Scan(&matchType, &bookingHostID, &startTime, &endTime, &courtName)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}

	if time.Now().After(startTime) {
		return echo.NewHTTPError(http.StatusBadRequest, "this booking has already started")
	}

	// Respect booking_allow_sub setting.
	var allowSub string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key='booking_allow_sub'`).Scan(&allowSub)
	if allowSub == "false" {
		return echo.NewHTTPError(http.StatusBadRequest, "player withdrawal is not currently enabled for this club")
	}

	// Enforce configurable minimum withdrawal notice.
	var noticeStr string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key='withdrawal_min_notice_hours'`).Scan(&noticeStr)
	minNoticeMinutes := 30.0 // default: 30 min
	if h, err := strconv.ParseFloat(noticeStr, 64); err == nil && h >= 0 {
		minNoticeMinutes = h * 60
	}
	if minNoticeMinutes > 0 && time.Until(startTime) < time.Duration(minNoticeMinutes)*time.Minute {
		hoursLeft := minNoticeMinutes / 60
		return echo.NewHTTPError(http.StatusBadRequest,
			fmt.Sprintf("cannot withdraw within %.3g hour(s) of the booking — contact a board member for help", hoursLeft))
	}

	var playerRowID, playerName string
	var playerEmail *string
	var isHost bool
	err = h.DB.QueryRow(ctx, `
		SELECT id, player_name, player_email, is_host
		FROM match_players
		WHERE booking_id = $1
		  AND withdrew_at IS NULL
		  AND (
		    user_id = $2
		    OR player_email = (SELECT email FROM users WHERE id = $2)
		  )
		LIMIT 1`,
		bookingID, userID,
	).Scan(&playerRowID, &playerName, &playerEmail, &isHost)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "you are not on this booking's roster")
	}

	if isHost && strings.TrimSpace(req.Reason) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "a reason is required when the host cancels or transfers a booking")
	}

	loc := loadTimezone(ctx, h.DB)
	startStr := startTime.In(loc).Format("Mon Jan 2 at 3:04 PM MST")
	endStr := endTime.In(loc).Format("3:04 PM MST")
	matchTypeLabels := map[string]string{
		"singles": "Singles", "doubles": "Doubles",
		"casual": "Hit Session", "ball_machine": "Ball Machine",
		"teaching_pro": "Teaching Pro",
	}
	matchLabel := matchTypeLabels[matchType]
	if matchLabel == "" {
		matchLabel = "Tennis"
	}

	// Send the withdrawing player a confirmation email.
	pemail := ""
	if playerEmail != nil {
		pemail = *playerEmail
	}
	if pemail != "" && h.Mailer != nil {
		go h.sendWithdrawConfirmationEmail(pemail, playerName, courtName, startStr, endStr, matchLabel, req.Reason)
	}

	// Case A: host withdraws from singles/casual → cancel the whole booking.
	if isHost && matchType != "doubles" {
		type otherP struct{ name, email string }
		var others []otherP
		orows, _ := h.DB.Query(ctx, `
			SELECT player_name, COALESCE(player_email,'')
			FROM match_players
			WHERE booking_id = $1 AND user_id != $2 AND withdrew_at IS NULL`,
			bookingID, userID)
		if orows != nil {
			defer orows.Close()
			for orows.Next() {
				var op otherP
				orows.Scan(&op.name, &op.email)
				others = append(others, op)
			}
		}
		h.DB.Exec(ctx, `UPDATE match_invitations SET status='cancelled', responded_at=NOW() WHERE booking_id=$1 AND status='pending'`, bookingID)
		h.DB.Exec(ctx, `DELETE FROM bookings WHERE id = $1`, bookingID)
		for _, op := range others {
			if op.email != "" {
				o := op
				go h.sendHostCancelledEmail(o.email, o.name, playerName, courtName, startStr, endStr, req.Reason, matchLabel)
			}
		}
		return c.NoContent(http.StatusNoContent)
	}

	// All other cases: soft-withdraw.
	h.DB.Exec(ctx, `UPDATE match_players SET withdrew_at=NOW(), withdraw_reason=$1 WHERE id=$2`, req.Reason, playerRowID)
	// Cancel pending invitations this player sent.
	h.DB.Exec(ctx, `UPDATE match_invitations SET status='cancelled', responded_at=NOW() WHERE booking_id=$1 AND inviter_id=$2 AND status='pending'`, bookingID, userID)

	// Auto-cancel the booking if the roster is now empty.
	var remaining int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM match_players WHERE booking_id=$1 AND withdrew_at IS NULL`, bookingID).Scan(&remaining)
	if remaining == 0 {
		h.DB.Exec(ctx, `UPDATE match_invitations SET status='cancelled', responded_at=NOW() WHERE booking_id=$1 AND status='pending'`, bookingID)
		h.DB.Exec(ctx, `DELETE FROM bookings WHERE id=$1`, bookingID)
		return c.NoContent(http.StatusNoContent)
	}

	// Case B: non-host withdraws from singles → notify host.
	if !isHost && matchType == "singles" {
		var hostEmail, hostName string
		h.DB.QueryRow(ctx, `SELECT email, first_name || ' ' || last_name FROM users WHERE id=$1`, bookingHostID).
			Scan(&hostEmail, &hostName)
		go h.sendPlayerWithdrewSinglesEmail(hostEmail, hostName, playerName, courtName, startStr, endStr, req.Reason)
		return c.NoContent(http.StatusNoContent)
	}

	// Cases C & D: doubles (or casual multi-player) — notify everyone; transfer host if needed.
	newHostName := ""
	if isHost {
		var nextRowID, nextPlayerName string
		var nextUserID *string
		if req.TransferToPlayerID != nil && *req.TransferToPlayerID != "" {
			// Host explicitly chose who to transfer to.
			h.DB.QueryRow(ctx, `
				SELECT id, player_name, user_id FROM match_players
				WHERE booking_id=$1 AND id=$2 AND withdrew_at IS NULL`,
				bookingID, *req.TransferToPlayerID,
			).Scan(&nextRowID, &nextPlayerName, &nextUserID)
		} else {
			// Fall back to earliest-added remaining player.
			h.DB.QueryRow(ctx, `
				SELECT id, player_name, user_id FROM match_players
				WHERE booking_id=$1 AND withdrew_at IS NULL
				ORDER BY added_at LIMIT 1`,
				bookingID,
			).Scan(&nextRowID, &nextPlayerName, &nextUserID)
		}
		if nextRowID != "" {
			h.DB.Exec(ctx, `UPDATE match_players SET is_host=TRUE WHERE id=$1`, nextRowID)
			if nextUserID != nil {
				h.DB.Exec(ctx, `UPDATE bookings SET user_id=$1 WHERE id=$2`, *nextUserID, bookingID)
			}
			newHostName = nextPlayerName
		}
	}

	type remP struct {
		name, email string
		isHost      bool
	}
	var remPlayers []remP
	rrows, _ := h.DB.Query(ctx, `
		SELECT player_name, COALESCE(player_email,''), is_host
		FROM match_players
		WHERE booking_id=$1 AND withdrew_at IS NULL
		ORDER BY is_host DESC, added_at`, bookingID)
	if rrows != nil {
		defer rrows.Close()
		for rrows.Next() {
			var rp remP
			rrows.Scan(&rp.name, &rp.email, &rp.isHost)
			remPlayers = append(remPlayers, rp)
		}
	}
	for _, rp := range remPlayers {
		if rp.email != "" {
			r := rp
			go h.sendPlayerWithdrewDoublesEmail(r.email, r.name, playerName, courtName, startStr, endStr, req.Reason, matchLabel, newHostName)
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *InvitationsHandler) sendWithdrawConfirmationEmail(to, name, court, startStr, endStr, matchLabel, reason string) {
	reasonLine := ""
	if reason != "" {
		reasonLine = fmt.Sprintf(`<p style="color:#6b7280;font-size:14px">Your reason: <em>%s</em></p>`, reason)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#6b7280">You've Left the Booking</h2>
  <p>Hi %s,</p>
  <p>You've been removed from the following match:</p>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s – %s</strong></div>
  </div>
  %s
  <p style="color:#6b7280;font-size:13px">If this was a mistake, contact the booking host.</p>
</div>`, name, court, matchLabel, startStr, endStr, reasonLine)
	h.Mailer.Send(to, "You've left a booking – "+court, body)
}

func (h *InvitationsHandler) sendHostCancelledEmail(to, toName, hostName, court, startStr, endStr, reason, matchLabel string) {
	reasonLine := ""
	if reason != "" {
		reasonLine = fmt.Sprintf(`<p><strong>Reason:</strong> %s</p>`, reason)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">Match Cancelled</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has cancelled the following booking:</p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s – %s</strong></div>
  </div>
  %s
  <p>The booking has been removed from your schedule.</p>
  <a href="%s/bookings" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px">Book a New Court →</a>
</div>`, toName, hostName, court, matchLabel, startStr, endStr, reasonLine, h.SiteURL)
	h.Mailer.Send(to, "Match cancelled by host – "+court, body)
}

func (h *InvitationsHandler) sendPlayerWithdrewSinglesEmail(hostEmail, hostName, playerName, court, startStr, endStr, reason string) {
	reasonLine := ""
	if reason != "" {
		reasonLine = fmt.Sprintf(`<p><strong>Reason:</strong> %s</p>`, reason)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#d97706">Player Withdrew</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has withdrawn from your match:</p>
  <div style="background:#fffbeb;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s – %s</strong></div>
  </div>
  %s
  <p>You'll need to invite someone else to fill the open spot.</p>
  <a href="%s/bookings" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px">Invite Someone →</a>
</div>`, hostName, playerName, court, startStr, endStr, reasonLine, h.SiteURL)
	h.Mailer.Send(hostEmail, playerName+" withdrew from your match – "+court, body)
}

func (h *InvitationsHandler) sendPlayerWithdrewDoublesEmail(to, toName, playerName, court, startStr, endStr, reason, matchLabel, newHostName string) {
	reasonLine := ""
	if reason != "" {
		reasonLine = fmt.Sprintf(`<p><strong>Reason:</strong> %s</p>`, reason)
	}
	hostTransferLine := ""
	if newHostName != "" {
		hostTransferLine = fmt.Sprintf(`<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:12px 0;color:#166534">
  <strong>%s</strong> is now the host of this match.
</div>`, newHostName)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#d97706">Player Withdrew — Spot Available</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has withdrawn from the match:</p>
  <div style="background:#fffbeb;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin:4px 0">📅 <strong>%s – %s</strong></div>
  </div>
  %s
  %s
  <p>There is now an open spot. Any player on the match can invite someone to fill it.</p>
  <a href="%s/bookings" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px">View Match &amp; Invite →</a>
</div>`, toName, playerName, court, matchLabel, startStr, endStr, reasonLine, hostTransferLine, h.SiteURL)
	h.Mailer.Send(to, playerName+" withdrew — open spot on your match", body)
}

// lookupGuestFee returns the configured guest fee based on peak/off-peak hours.
func (h *InvitationsHandler) lookupGuestFee(ctx context.Context, bookingStart time.Time) float64 {
	rows, err := h.DB.Query(ctx, `
		SELECT key, value FROM settings
		WHERE key IN ('guest_fee_peak','guest_fee_offpeak','peak_hours_start','peak_hours_end')`)
	if err != nil {
		return 5.00
	}
	defer rows.Close()
	cfg := map[string]string{}
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		cfg[k] = v
	}
	loc := loadTimezone(ctx, h.DB)
	hhmm := bookingStart.In(loc).Format("15:04")
	isPeak := cfg["peak_hours_start"] != "" && cfg["peak_hours_end"] != "" &&
		hhmm >= cfg["peak_hours_start"] && hhmm < cfg["peak_hours_end"]
	feeKey := "guest_fee_offpeak"
	if isPeak {
		feeKey = "guest_fee_peak"
	}
	if fee, err := strconv.ParseFloat(cfg[feeKey], 64); err == nil {
		return fee
	}
	return 5.00
}
