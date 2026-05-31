package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BookingsHandler struct {
	DB     *pgxpool.Pool
	Mailer interface {
		Send(to, subject, body string) error
	}
	SiteURL string
	Logger  interface {
		Log(ctx context.Context, event, details, userID, ip string)
	}
}

// emailRoster sends an email to every player on the roster who has a user account.
func (h *BookingsHandler) emailRoster(bookingID, subject, body string) {
	if h.Mailer == nil {
		return
	}
	rows, err := h.DB.Query(context.Background(),
		`SELECT u.email FROM match_players mp
		 JOIN users u ON u.id = mp.user_id
		 WHERE mp.booking_id = $1 AND mp.user_id IS NOT NULL AND mp.withdrew_at IS NULL`, bookingID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var email string
		if rows.Scan(&email) == nil {
			e := email
			go h.Mailer.Send(e, subject, body)
		}
	}
}

func bookingCard(courtName string, start, end time.Time, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}
	return fmt.Sprintf("<strong>%s</strong><br>%s – %s",
		courtName,
		start.In(loc).Format("Mon Jan 2 at 3:04 PM MST"),
		end.In(loc).Format("3:04 PM MST"))
}

func (h *BookingsHandler) List(c echo.Context) error {
	date := c.QueryParam("date")
	var rows interface {
		Next() bool
		Close()
		Scan(...interface{}) error
	}
	var err error

	const baseQuery = `
		SELECT b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes, b.created_at,
		       COALESCE(b.match_type, ''), b.players_needed,
		       u.first_name, u.last_name, ct.name, ct.number,
		       COALESCE(array_agg(mp.player_name ORDER BY mp.is_host DESC, mp.added_at)
		                FILTER (WHERE mp.player_name IS NOT NULL), ARRAY[]::text[]) AS players
		FROM bookings b
		JOIN users u ON u.id = b.user_id
		JOIN courts ct ON ct.id = b.court_id
		LEFT JOIN match_players mp ON mp.booking_id = b.id AND mp.withdrew_at IS NULL`
	const groupBy = ` GROUP BY b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes,
		       b.created_at, b.match_type, b.players_needed,
		       u.first_name, u.last_name, ct.name, ct.number`

	if date != "" {
		rows, err = h.DB.Query(c.Request().Context(),
			baseQuery+` WHERE b.start_time::date = $1`+groupBy+` ORDER BY b.start_time`, date)
	} else {
		rows, err = h.DB.Query(c.Request().Context(),
			baseQuery+` WHERE b.start_time >= NOW()`+groupBy+` ORDER BY b.start_time LIMIT 100`)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch bookings")
	}
	defer rows.Close()

	bookings := []models.Booking{}
	for rows.Next() {
		var b models.Booking
		b.User = &models.User{}
		b.Court = &models.Court{}
		if err := rows.Scan(&b.ID, &b.UserID, &b.CourtID, &b.StartTime, &b.EndTime, &b.Notes, &b.CreatedAt,
			&b.MatchType, &b.PlayersNeeded,
			&b.User.FirstName, &b.User.LastName, &b.Court.Name, &b.Court.Number,
			&b.Players); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan booking")
		}
		bookings = append(bookings, b)
	}
	return c.JSON(http.StatusOK, bookings)
}

// Mine returns only the authenticated user's upcoming bookings with per-booking invite status counts.
func (h *BookingsHandler) Mine(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes, b.created_at,
		       COALESCE(b.match_type, ''), b.players_needed,
		       u.first_name, u.last_name, ct.name, ct.number,
		       COALESCE(array_agg(DISTINCT mp.player_name ORDER BY mp.player_name)
		                FILTER (WHERE mp.player_name IS NOT NULL), ARRAY[]::text[]) AS players,
		       COUNT(mi.id) FILTER (WHERE mi.status = 'pending')  AS invites_pending,
		       COUNT(mi.id) FILTER (WHERE mi.status = 'declined') AS invites_declined
		FROM bookings b
		JOIN users u ON u.id = b.user_id
		JOIN courts ct ON ct.id = b.court_id
		LEFT JOIN match_players mp ON mp.booking_id = b.id AND mp.withdrew_at IS NULL
		LEFT JOIN match_invitations mi ON mi.booking_id = b.id
		WHERE b.start_time >= NOW()
		  AND (
		    b.user_id = $1
		    OR EXISTS (
		      SELECT 1 FROM match_players mp2
		      WHERE mp2.booking_id = b.id
		        AND mp2.withdrew_at IS NULL
		        AND (
		          mp2.user_id = $1
		          OR mp2.player_email = (SELECT email FROM users WHERE id = $1)
		        )
		    )
		  )
		GROUP BY b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes,
		         b.created_at, b.match_type, b.players_needed,
		         u.first_name, u.last_name, ct.name, ct.number
		ORDER BY b.start_time`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch bookings")
	}
	defer rows.Close()

	bookings := []models.Booking{}
	for rows.Next() {
		var b models.Booking
		b.User = &models.User{}
		b.Court = &models.Court{}
		if err := rows.Scan(&b.ID, &b.UserID, &b.CourtID, &b.StartTime, &b.EndTime, &b.Notes, &b.CreatedAt,
			&b.MatchType, &b.PlayersNeeded,
			&b.User.FirstName, &b.User.LastName, &b.Court.Name, &b.Court.Number,
			&b.Players, &b.InvitesPending, &b.InvitesDeclined); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan booking")
		}
		bookings = append(bookings, b)
	}
	return c.JSON(http.StatusOK, bookings)
}

func (h *BookingsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		CourtID       int       `json:"court_id"`
		StartTime     time.Time `json:"start_time"`
		EndTime       time.Time `json:"end_time"`
		Notes         string    `json:"notes"`
		MatchType     string    `json:"match_type"`
		PlayersNeeded int       `json:"players_needed"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	if req.EndTime.Before(req.StartTime) || req.EndTime.Equal(req.StartTime) {
		return echo.NewHTTPError(http.StatusBadRequest, "end time must be after start time")
	}
	if req.StartTime.Before(time.Now()) {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot book in the past")
	}
	loc := loadTimezone(c.Request().Context(), h.DB)
	localStart := req.StartTime.In(loc)
	localEnd := req.EndTime.In(loc)
	// UTC boundaries for the local booking day — used for all per-day limit checks.
	dayStart := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, loc).UTC()
	dayEnd := dayStart.Add(24 * time.Hour)
	if localStart.Hour() < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "bookings cannot start before 8:00 AM")
	}
	if localEnd.Hour() > 20 || (localEnd.Hour() == 20 && localEnd.Minute() > 0) {
		return echo.NewHTTPError(http.StatusBadRequest, "bookings must end by 8:00 PM")
	}

	// Enforce days-in-advance limit
	var maxDaysStr string
	if scanErr := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_max_days_ahead'`).Scan(&maxDaysStr); scanErr == nil {
		if maxDays, convErr := strconv.Atoi(maxDaysStr); convErr == nil && maxDays > 0 {
			nowLA := time.Now().In(loc)
			todayStart := time.Date(nowLA.Year(), nowLA.Month(), nowLA.Day(), 0, 0, 0, 0, loc)
			deadline := todayStart.AddDate(0, 0, maxDays+1) // midnight after the last allowed day
			if !localStart.Before(deadline) {
				return echo.NewHTTPError(http.StatusBadRequest,
					fmt.Sprintf("courts can only be booked up to %d days in advance", maxDays))
			}
		}
	}

	// ── Per-day minutes limit ─────────────────────────────────────────────
	var maxMinStr string
	if scanErr := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_max_minutes_per_day'`).Scan(&maxMinStr); scanErr == nil {
		if maxMin, convErr := strconv.Atoi(maxMinStr); convErr == nil && maxMin > 0 {
			var usedMin float64
			h.DB.QueryRow(c.Request().Context(),
				`SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))/60),0)
				 FROM bookings WHERE user_id = $1 AND start_time >= $2 AND start_time < $3`,
				userID, dayStart, dayEnd).Scan(&usedMin)
			newMin := req.EndTime.Sub(req.StartTime).Minutes()
			if int(usedMin)+int(newMin) > maxMin {
				return echo.NewHTTPError(http.StatusBadRequest,
					fmt.Sprintf("you have reached your daily limit of %d minutes on court", maxMin))
			}
		}
	}

	// ── Per-week booking limit ────────────────────────────────────────────
	for _, key := range []string{"booking_max_per_week", "booking_max_courts_per_week"} {
		var maxWkStr string
		if scanErr := h.DB.QueryRow(c.Request().Context(),
			`SELECT value FROM settings WHERE key = $1`, key).Scan(&maxWkStr); scanErr == nil {
			if maxWk, convErr := strconv.Atoi(maxWkStr); convErr == nil && maxWk > 0 {
				var weekCount int
				h.DB.QueryRow(c.Request().Context(),
					`SELECT COUNT(*) FROM bookings WHERE user_id = $1
					 AND DATE_TRUNC('week', start_time AT TIME ZONE 'America/Los_Angeles')
					   = DATE_TRUNC('week', $2 AT TIME ZONE 'America/Los_Angeles')`,
					userID, req.StartTime).Scan(&weekCount)
				if weekCount >= maxWk {
					return echo.NewHTTPError(http.StatusBadRequest,
						fmt.Sprintf("you have reached your weekly limit of %d reservations", maxWk))
				}
			}
		}
	}

	// ── Sandwich gap (min gap between same-member bookings on same court) ─
	var minGapStr string
	if scanErr := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_min_gap_minutes'`).Scan(&minGapStr); scanErr == nil {
		if minGap, convErr := strconv.Atoi(minGapStr); convErr == nil && minGap > 0 {
			var tooClose int
			h.DB.QueryRow(c.Request().Context(),
				`SELECT COUNT(*) FROM bookings
				 WHERE user_id = $1 AND court_id = $2
				   AND start_time >= $3 AND start_time < $4
				   AND (
				     (end_time > $5 - make_interval(mins => $6) AND end_time <= $5) OR
				     (start_time >= $7 AND start_time < $7 + make_interval(mins => $6))
				   )`,
				userID, req.CourtID, dayStart, dayEnd, req.StartTime, minGap, req.EndTime).Scan(&tooClose)
			if tooClose > 0 {
				return echo.NewHTTPError(http.StatusBadRequest,
					fmt.Sprintf("bookings on the same court must be at least %d minutes apart", minGap))
			}
		}
	}

	// ── Hard check: member cannot have overlapping bookings on any court ──
	var memberOverlap int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time < $2 AND end_time > $3`,
		userID, req.EndTime, req.StartTime).Scan(&memberOverlap)
	if memberOverlap > 0 {
		return echo.NewHTTPError(http.StatusConflict, "you already have a booking that overlaps with this time slot")
	}

	// ── Per-day booking limit ─────────────────────────────────────────────
	// Enforce per-day booking limit (default 1, configurable via settings)
	maxPerDay := 1
	var maxStr string
	if scanErr := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_max_per_day'`).Scan(&maxStr); scanErr == nil {
		if v, convErr := strconv.Atoi(maxStr); convErr == nil && v > 0 {
			maxPerDay = v
		}
	}
	var bookingsToday int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time >= $2 AND start_time < $3`,
		userID, dayStart, dayEnd).Scan(&bookingsToday)
	if bookingsToday >= maxPerDay {
		if maxPerDay == 1 {
			return echo.NewHTTPError(http.StatusBadRequest, "you already have a booking on this date")
		}
		return echo.NewHTTPError(http.StatusBadRequest,
			fmt.Sprintf("members may not make more than %d bookings per day", maxPerDay))
	}

	// ── Max duration limit ────────────────────────────────────────────────
	var maxDurStr string
	if scanErr := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_max_duration_hours'`).Scan(&maxDurStr); scanErr == nil {
		if maxDurF, convErr := strconv.ParseFloat(maxDurStr, 64); convErr == nil && maxDurF > 0 {
			durationHours := req.EndTime.Sub(req.StartTime).Hours()
			if durationHours > maxDurF {
				return echo.NewHTTPError(http.StatusBadRequest,
					fmt.Sprintf("bookings may not exceed %.0g hour(s)", maxDurF))
			}
		}
	}

	if req.MatchType == "" {
		req.MatchType = "casual"
	}

	var booking models.Booking
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO bookings (user_id, court_id, start_time, end_time, notes, match_type, players_needed)
		 VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7)
		 RETURNING id, user_id, court_id, start_time, end_time, notes, created_at`,
		userID, req.CourtID, req.StartTime, req.EndTime, req.Notes, req.MatchType, req.PlayersNeeded,
	).Scan(&booking.ID, &booking.UserID, &booking.CourtID, &booking.StartTime, &booking.EndTime, &booking.Notes, &booking.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "court already booked for that time")
	}

	// Add host to match roster
	var hostName, hostEmail string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name || ' ' || last_name, email FROM users WHERE id = $1`, userID).Scan(&hostName, &hostEmail)
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO match_players (booking_id, user_id, player_name, is_host) VALUES ($1, $2, $3, true)`,
		booking.ID, userID, hostName)

	// Confirmation email to host — sent after a short delay so the frontend has
	// time to POST invitations and direct-player additions before we snapshot the roster.
	if h.Mailer != nil && hostEmail != "" {
		var courtName string
		h.DB.QueryRow(c.Request().Context(), `SELECT name FROM courts WHERE id = $1`, req.CourtID).Scan(&courtName)
		loc := loadTimezone(c.Request().Context(), h.DB)

		matchTypeLabels := map[string]string{
			"singles":      "Singles",
			"doubles":      "Doubles",
			"casual":       "Hit Session",
			"ball_machine": "Ball Machine",
			"teaching_pro": "Teaching Pro",
		}
		matchLabel := matchTypeLabels[req.MatchType]
		if matchLabel == "" {
			matchLabel = "Tennis"
		}

		startStr := req.StartTime.In(loc).Format("Mon Jan 2 at 3:04 PM MST")
		endStr := req.EndTime.In(loc).Format("3:04 PM MST")
		bookingID := booking.ID
		playersNeeded := req.PlayersNeeded

		go func() {
			// Wait for the frontend to finish posting invitations / direct players
			time.Sleep(5 * time.Second)

			// Confirmed players on the roster
			rosterHTML := ""
			var confirmedCount int
			prows, _ := h.DB.Query(context.Background(), `
				SELECT player_name, is_host FROM match_players
				WHERE booking_id = $1 AND withdrew_at IS NULL ORDER BY is_host DESC, added_at`, bookingID)
			if prows != nil {
				defer prows.Close()
				for prows.Next() {
					var name string
					var isHost bool
					prows.Scan(&name, &isHost)
					suffix := ""
					if isHost {
						suffix = " (Host)"
					}
					rosterHTML += fmt.Sprintf(`<li style="margin:4px 0">%s%s</li>`, name, suffix)
					confirmedCount++
				}
			}

			// Pending invitations
			inviteHTML := ""
			irows, _ := h.DB.Query(context.Background(), `
				SELECT invitee_name FROM match_invitations
				WHERE booking_id = $1 AND status = 'pending'
				ORDER BY created_at`, bookingID)
			if irows != nil {
				defer irows.Close()
				for irows.Next() {
					var name string
					irows.Scan(&name)
					inviteHTML += fmt.Sprintf(`<li style="margin:4px 0;color:#6b7280;font-style:italic">%s (invited)</li>`, name)
				}
			}

			// Remaining open spots
			openSpots := playersNeeded + 1 - confirmedCount
			if openSpots < 0 {
				openSpots = 0
			}
			for i := 0; i < openSpots; i++ {
				if inviteHTML == "" {
					rosterHTML += `<li style="margin:4px 0;color:#9ca3af;font-style:italic">Open spot</li>`
				}
			}

			playerSection := rosterHTML + inviteHTML

			var ctaHTML string
			if openSpots > 0 && inviteHTML == "" {
				plural := "s"
				if openSpots == 1 {
					plural = ""
				}
				ctaHTML = fmt.Sprintf(`
<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:12px;margin:16px 0;color:#854d0e">
  ⚠️ You still need <strong>%d more player%s</strong> — invite them from the bookings page.
</div>
<p style="margin:16px 0">
  <a href="%s/bookings" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
    Invite Players →
  </a>
</p>`, openSpots, plural, h.SiteURL)
			} else {
				ctaHTML = fmt.Sprintf(`<p style="margin:16px 0"><a href="%s/bookings" style="color:#15803d">View your bookings →</a></p>`, h.SiteURL)
			}

			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Booking Confirmed</h2>
  <p>Hi %s,</p>
  <p>Your court booking is confirmed:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">⏰ <strong>%s – %s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
    <div style="margin-top:12px;font-weight:600;color:#166534">Players:</div>
    <ul style="margin:8px 0;padding-left:20px;color:#374151">%s</ul>
  </div>
  %s
</div>`, hostName, courtName, startStr, endStr, matchLabel, playerSection, ctaHTML)
			h.Mailer.Send(hostEmail, "Booking confirmed – "+courtName, body)
		}()
	}

	h.Logger.Log(c.Request().Context(), "booking_created",
		fmt.Sprintf("Court %d on %s", req.CourtID, req.StartTime.Format("2006-01-02 15:04")),
		userID, c.RealIP())

	// Auto-log 1 can of balls for this booking.
	var courtNameForBalls string
	h.DB.QueryRow(c.Request().Context(), `SELECT name FROM courts WHERE id = $1`, req.CourtID).Scan(&courtNameForBalls)
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO ball_usage (used_date, quantity, source, booking_id, user_id, user_name, court_name)
		 VALUES ($1::date, 1, 'booking', $2, $3, $4, $5)`,
		req.StartTime.Format("2006-01-02"), booking.ID, userID, hostName, courtNameForBalls)

	return c.JSON(http.StatusCreated, booking)
}

func (h *BookingsHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	role := c.Get("role").(string)

	var ownerID string
	var currentCourtID int
	var currentStart, currentEnd time.Time
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT user_id, court_id, start_time, end_time FROM bookings WHERE id = $1`, id,
	).Scan(&ownerID, &currentCourtID, &currentStart, &currentEnd); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}
	if ownerID != userID && role != "admin" && role != "board" {
		return echo.NewHTTPError(http.StatusForbidden, "cannot edit another member's booking")
	}

	var req struct {
		Notes         string    `json:"notes"`
		MatchType     string    `json:"match_type"`
		PlayersNeeded int       `json:"players_needed"`
		EndTime       time.Time `json:"end_time"`
		CourtID       int       `json:"court_id"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	// Determine new end time
	newEnd := currentEnd
	if !req.EndTime.IsZero() {
		newEnd = req.EndTime
		if !newEnd.After(currentStart) {
			return echo.NewHTTPError(http.StatusBadRequest, "end time must be after start time")
		}
		loc, locErr := time.LoadLocation("America/Los_Angeles")
		if locErr != nil {
			loc = time.UTC
		}
		localEnd := newEnd.In(loc)
		if localEnd.Hour() > 20 || (localEnd.Hour() == 20 && localEnd.Minute() > 0) {
			return echo.NewHTTPError(http.StatusBadRequest, "bookings must end by 8:00 PM")
		}
	}

	// Determine new court
	newCourtID := currentCourtID
	if req.CourtID != 0 && req.CourtID != currentCourtID {
		newCourtID = req.CourtID
	}

	// Check for conflicts whenever the court or duration changes
	if newCourtID != currentCourtID || newEnd != currentEnd {
		var conflicts int
		h.DB.QueryRow(c.Request().Context(),
			`SELECT COUNT(*) FROM bookings
			 WHERE court_id = $1 AND id != $2
			   AND start_time < $3 AND end_time > $4`,
			newCourtID, id, newEnd, currentStart,
		).Scan(&conflicts)
		if conflicts > 0 {
			return echo.NewHTTPError(http.StatusConflict, "court is already booked during that time")
		}
	}

	if req.MatchType == "" {
		req.MatchType = "casual"
	}

	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE bookings SET notes = NULLIF($1,''), match_type = $2, players_needed = $3, end_time = $4, court_id = $5
		 WHERE id = $6`,
		req.Notes, req.MatchType, req.PlayersNeeded, newEnd, newCourtID, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update booking")
	}

	// Notify all roster players when the court or time changed
	if h.Mailer != nil && (newCourtID != currentCourtID || newEnd != currentEnd) {
		var courtName string
		h.DB.QueryRow(c.Request().Context(), `SELECT name FROM courts WHERE id = $1`, newCourtID).Scan(&courtName)
		card := bookingCard(courtName, currentStart, newEnd, loadTimezone(c.Request().Context(), h.DB))
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">📋 Booking Updated</h2>
  <p>A court booking you are on has been updated:</p>
  <div style="background:#fefce8;border-radius:8px;padding:16px;margin:16px 0">%s</div>
  <a href="%s/bookings" style="color:#15803d">View bookings →</a>
</div>`, card, h.SiteURL)
		go h.emailRoster(id, "Booking updated – "+courtName, body)
	}

	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

func (h *BookingsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	role := c.Get("role").(string)

	var req struct {
		Reason string `json:"reason"`
	}
	c.Bind(&req) // optional body — ignore bind errors

	var ownerID string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT user_id FROM bookings WHERE id = $1`, id).Scan(&ownerID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}

	if ownerID != userID && role != "admin" && role != "board" {
		return echo.NewHTTPError(http.StatusForbidden, "cannot cancel another member's booking")
	}

	// ── Cancellation notice period (members only) ──────────────────────
	if ownerID == userID && role != "admin" && role != "board" {
		var cancelHoursStr string
		if scanErr := h.DB.QueryRow(c.Request().Context(),
			`SELECT value FROM settings WHERE key = 'booking_cancel_hours'`).Scan(&cancelHoursStr); scanErr == nil {
			if cancelHours, convErr := strconv.ParseFloat(cancelHoursStr, 64); convErr == nil && cancelHours > 0 {
				var startTime time.Time
				h.DB.QueryRow(c.Request().Context(),
					`SELECT start_time FROM bookings WHERE id = $1`, id).Scan(&startTime)
				hoursUntil := time.Until(startTime).Hours()
				if hoursUntil >= 0 && hoursUntil < cancelHours {
					return echo.NewHTTPError(http.StatusBadRequest,
						fmt.Sprintf("bookings must be cancelled at least %.0g hour(s) before the start time", cancelHours))
				}
			}
		}
	}

	// Email all roster players before the booking is deleted
	if h.Mailer != nil {
		var courtName, matchType string
		var startTime, endTime time.Time
		h.DB.QueryRow(c.Request().Context(),
			`SELECT ct.name, COALESCE(b.match_type,'casual'), b.start_time, b.end_time
			 FROM bookings b JOIN courts ct ON ct.id = b.court_id WHERE b.id = $1`, id,
		).Scan(&courtName, &matchType, &startTime, &endTime)
		if courtName != "" {
			loc := loadTimezone(c.Request().Context(), h.DB)
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
			var reasonHTML string
			if req.Reason != "" {
				reasonHTML = fmt.Sprintf(`
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:12px 0;color:#991b1b">
    <strong>Reason:</strong> %s
  </div>`, req.Reason)
			}
			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">❌ Booking Cancelled</h2>
  <p>The following court booking has been cancelled:</p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">⏰ <strong>%s – %s</strong></div>
    <div style="margin:4px 0">📋 <strong>%s</strong></div>
  </div>
  %s
  <a href="%s/bookings" style="color:#15803d">View your bookings →</a>
</div>`, courtName, startStr, endStr, matchLabel, reasonHTML, h.SiteURL)
			go h.emailRoster(id, "Booking cancelled – "+courtName, body)
		}
	}

	h.DB.Exec(c.Request().Context(), `DELETE FROM bookings WHERE id = $1`, id)
	h.Logger.Log(c.Request().Context(), "booking_cancelled", id, userID, c.RealIP())
	return c.NoContent(http.StatusNoContent)
}

// ListCancelReasons returns all admin-defined cancellation reasons.
func (h *BookingsHandler) ListCancelReasons(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, reason FROM booking_cancel_reasons ORDER BY sort_order, created_at`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch reasons")
	}
	defer rows.Close()
	type Item struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	items := []Item{}
	for rows.Next() {
		var i Item
		if err := rows.Scan(&i.ID, &i.Reason); err != nil {
			continue
		}
		items = append(items, i)
	}
	return c.JSON(http.StatusOK, items)
}

// CreateCancelReason adds a new canned cancellation reason (admin+).
func (h *BookingsHandler) CreateCancelReason(c echo.Context) error {
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.Bind(&req); err != nil || req.Reason == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "reason required")
	}
	var id string
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO booking_cancel_reasons (reason) VALUES ($1) RETURNING id`, req.Reason,
	).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create reason")
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": id, "reason": req.Reason})
}

// DeleteCancelReason removes a canned cancellation reason (admin+).
func (h *BookingsHandler) DeleteCancelReason(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM booking_cancel_reasons WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// History returns the current user's past bookings (most recent first).
func (h *BookingsHandler) History(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes, b.created_at,
		       COALESCE(b.match_type, ''), b.players_needed,
		       u.first_name, u.last_name, ct.name, ct.number,
		       COALESCE(array_agg(mp.player_name ORDER BY mp.is_host DESC, mp.added_at)
		                FILTER (WHERE mp.player_name IS NOT NULL), ARRAY[]::text[]) AS players
		FROM bookings b
		JOIN users u ON u.id = b.user_id
		JOIN courts ct ON ct.id = b.court_id
		LEFT JOIN match_players mp ON mp.booking_id = b.id AND mp.withdrew_at IS NULL
		WHERE b.start_time < NOW()
		  AND (
		    b.user_id = $1
		    OR EXISTS (
		      SELECT 1 FROM match_players mp2
		      WHERE mp2.booking_id = b.id
		        AND (
		          mp2.user_id = $1
		          OR mp2.player_email = (SELECT email FROM users WHERE id = $1)
		        )
		    )
		  )
		GROUP BY b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes,
		         b.created_at, b.match_type, b.players_needed,
		         u.first_name, u.last_name, ct.name, ct.number
		ORDER BY b.start_time DESC LIMIT 30`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch history")
	}
	defer rows.Close()
	bookings := []models.Booking{}
	for rows.Next() {
		var b models.Booking
		b.User = &models.User{}
		b.Court = &models.Court{}
		if err := rows.Scan(&b.ID, &b.UserID, &b.CourtID, &b.StartTime, &b.EndTime, &b.Notes, &b.CreatedAt,
			&b.MatchType, &b.PlayersNeeded,
			&b.User.FirstName, &b.User.LastName, &b.Court.Name, &b.Court.Number,
			&b.Players); err != nil {
			continue
		}
		bookings = append(bookings, b)
	}
	return c.JSON(http.StatusOK, bookings)
}

// TeachingProList returns teaching_pro bookings for a date range (admin).
func (h *BookingsHandler) TeachingProList(c echo.Context) error {
	from := c.QueryParam("from")
	to := c.QueryParam("to")
	if from == "" {
		from = time.Now().Format("2006-01") + "-01"
	}
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes, b.created_at,
		       b.match_type, b.players_needed,
		       u.first_name, u.last_name, ct.name, ct.number,
		       COALESCE(array_agg(mp.player_name ORDER BY mp.is_host DESC, mp.added_at)
		                FILTER (WHERE mp.player_name IS NOT NULL AND mp.withdrew_at IS NULL), ARRAY[]::text[]) AS players
		FROM bookings b
		JOIN users u ON u.id = b.user_id
		JOIN courts ct ON ct.id = b.court_id
		LEFT JOIN match_players mp ON mp.booking_id = b.id AND mp.withdrew_at IS NULL
		WHERE b.match_type = 'teaching_pro'
		  AND b.start_time::date BETWEEN $1 AND $2
		GROUP BY b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes,
		         b.created_at, b.match_type, b.players_needed,
		         u.first_name, u.last_name, ct.name, ct.number
		ORDER BY b.start_time DESC`, from, to)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch sessions")
	}
	defer rows.Close()
	bookings := []models.Booking{}
	for rows.Next() {
		var b models.Booking
		b.User = &models.User{}
		b.Court = &models.Court{}
		if err := rows.Scan(&b.ID, &b.UserID, &b.CourtID, &b.StartTime, &b.EndTime, &b.Notes, &b.CreatedAt,
			&b.MatchType, &b.PlayersNeeded,
			&b.User.FirstName, &b.User.LastName, &b.Court.Name, &b.Court.Number,
			&b.Players); err != nil {
			continue
		}
		bookings = append(bookings, b)
	}
	return c.JSON(http.StatusOK, bookings)
}

// calendarLinksHTML returns two "Add to Calendar" buttons: Google Calendar and an ICS download.
func calendarLinksHTML(summary, description string, startUTC, endUTC time.Time, icalURL string) string {
	dtStart := startUTC.UTC().Format("20060102T150405Z")
	dtEnd := endUTC.UTC().Format("20060102T150405Z")
	gcal := fmt.Sprintf(
		"https://calendar.google.com/calendar/render?action=TEMPLATE&text=%s&dates=%s/%s&details=%s&location=%s",
		url.QueryEscape(summary),
		dtStart, dtEnd,
		url.QueryEscape(description),
		url.QueryEscape("Live Oaks Tennis Club"),
	)
	return fmt.Sprintf(`
<div style="margin:20px 0">
  <p style="font-size:13px;color:#6b7280;margin:0 0 10px">Add to your calendar:</p>
  <a href="%s" style="background:#4285f4;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block;margin-right:8px">
    📅 Google Calendar
  </a>
  <a href="%s" style="background:#6b7280;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">
    📁 Apple / Outlook (.ics)
  </a>
</div>`, gcal, icalURL)
}

// ICal returns an iCalendar (.ics) file for the given booking.
// Public endpoint — linked from confirmation emails where the user may not be logged in.
func (h *BookingsHandler) ICal(c echo.Context) error {
	id := c.Param("id")

	var courtName, matchType string
	var startTime, endTime time.Time
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT ct.name, COALESCE(b.match_type,'casual'), b.start_time, b.end_time
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.id = $1`, id,
	).Scan(&courtName, &matchType, &startTime, &endTime)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}

	rows, _ := h.DB.Query(c.Request().Context(), `
		SELECT player_name, is_host FROM match_players
		WHERE booking_id = $1 AND withdrew_at IS NULL ORDER BY is_host DESC, added_at`, id)
	var playerNames []string
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			var isHost bool
			rows.Scan(&name, &isHost)
			if isHost {
				name += " (Host)"
			}
			playerNames = append(playerNames, name)
		}
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

	summary := fmt.Sprintf("%s – %s – Live Oaks Tennis Club", matchLabel, courtName)
	desc := fmt.Sprintf("Match Type: %s\\nCourt: %s", matchLabel, courtName)
	if len(playerNames) > 0 {
		desc += "\\nPlayers: " + strings.Join(playerNames, "\\, ")
	}

	dtStart := startTime.UTC().Format("20060102T150405Z")
	dtEnd := endTime.UTC().Format("20060102T150405Z")

	lines := []string{
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Live Oaks Tennis Club//EN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		"UID:booking-" + id + "@liveoaks",
		"DTSTART:" + dtStart,
		"DTEND:" + dtEnd,
		"SUMMARY:" + summary,
		"DESCRIPTION:" + desc,
		"LOCATION:Live Oaks Tennis Club",
		"END:VEVENT",
		"END:VCALENDAR",
	}

	c.Response().Header().Set("Content-Type", "text/calendar; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", `attachment; filename="liveoaks-booking.ics"`)
	return c.String(http.StatusOK, strings.Join(lines, "\r\n"))
}

// AdminCreate allows board/admin to create a booking on behalf of any member,
// bypassing per-member daily/weekly limits.
func (h *BookingsHandler) AdminCreate(c echo.Context) error {
	var req struct {
		UserID        string    `json:"user_id"`
		CourtID       int       `json:"court_id"`
		StartTime     time.Time `json:"start_time"`
		EndTime       time.Time `json:"end_time"`
		MatchType     string    `json:"match_type"`
		Notes         string    `json:"notes"`
		PlayersNeeded int       `json:"players_needed"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.CourtID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and court_id required")
	}
	if req.EndTime.Before(req.StartTime) || req.EndTime.Equal(req.StartTime) {
		return echo.NewHTTPError(http.StatusBadRequest, "end time must be after start time")
	}
	if req.MatchType == "" {
		req.MatchType = "casual"
	}
	// Court conflict check
	var conflicts int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM bookings WHERE court_id = $1 AND start_time < $2 AND end_time > $3`,
		req.CourtID, req.EndTime, req.StartTime).Scan(&conflicts)
	if conflicts > 0 {
		return echo.NewHTTPError(http.StatusConflict, "court already booked for that time")
	}

	// Member overlap check — a member cannot be on two courts at the same time
	var memberOverlapAdmin int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time < $2 AND end_time > $3`,
		req.UserID, req.EndTime, req.StartTime).Scan(&memberOverlapAdmin)
	if memberOverlapAdmin > 0 {
		return echo.NewHTTPError(http.StatusConflict, "this member already has a booking that overlaps with this time slot")
	}

	// Per-day count check (same rule as self-service, even for admin-created bookings)
	loc := loadTimezone(c.Request().Context(), h.DB)
	localStart := req.StartTime.In(loc)
	dayStart := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, loc).UTC()
	dayEnd := dayStart.Add(24 * time.Hour)
	maxPerDay := 1
	var maxStr string
	if scanErr := h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_max_per_day'`).Scan(&maxStr); scanErr == nil {
		if v, convErr := strconv.Atoi(maxStr); convErr == nil && v > 0 {
			maxPerDay = v
		}
	}
	var bookingsToday int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time >= $2 AND start_time < $3`,
		req.UserID, dayStart, dayEnd).Scan(&bookingsToday)
	if bookingsToday >= maxPerDay {
		return echo.NewHTTPError(http.StatusConflict,
			fmt.Sprintf("this member already has %d booking(s) on this date (daily limit: %d)", bookingsToday, maxPerDay))
	}

	var booking models.Booking
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO bookings (user_id, court_id, start_time, end_time, notes, match_type, players_needed)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), $6, $7)
		 RETURNING id, user_id, court_id, start_time, end_time, notes, created_at`,
		req.UserID, req.CourtID, req.StartTime, req.EndTime, req.Notes, req.MatchType, req.PlayersNeeded,
	).Scan(&booking.ID, &booking.UserID, &booking.CourtID, &booking.StartTime, &booking.EndTime, &booking.Notes, &booking.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create booking")
	}
	// Add member as host
	var memberName string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name || ' ' || last_name FROM users WHERE id = $1`, req.UserID).Scan(&memberName)
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO match_players (booking_id, user_id, player_name, is_host) VALUES ($1, $2, $3, true)`,
		booking.ID, req.UserID, memberName)

	adminID := c.Get("user_id").(string)
	h.Logger.Log(c.Request().Context(), "admin_booking_created",
		fmt.Sprintf("for %s on court %d at %s", memberName, req.CourtID, req.StartTime.Format("2006-01-02 15:04")),
		adminID, c.RealIP())
	return c.JSON(http.StatusCreated, booking)
}
