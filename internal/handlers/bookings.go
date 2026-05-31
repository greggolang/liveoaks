package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
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
		 WHERE mp.booking_id = $1 AND mp.user_id IS NOT NULL`, bookingID)
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
		LEFT JOIN match_players mp ON mp.booking_id = b.id`
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

// Mine returns only the authenticated user's upcoming bookings.
func (h *BookingsHandler) Mine(c echo.Context) error {
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
		LEFT JOIN match_players mp ON mp.booking_id = b.id
		WHERE b.user_id = $1 AND b.start_time >= NOW()
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
			&b.Players); err != nil {
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

	// Confirmation email to host
	if h.Mailer != nil && hostEmail != "" {
		var courtName string
		h.DB.QueryRow(c.Request().Context(), `SELECT name FROM courts WHERE id = $1`, req.CourtID).Scan(&courtName)
		card := bookingCard(courtName, req.StartTime, req.EndTime, loadTimezone(c.Request().Context(), h.DB))
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Booking Confirmed</h2>
  <p>Hi %s,</p>
  <p>Your court booking is confirmed:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">%s</div>
  <a href="%s/bookings" style="color:#15803d">View your bookings →</a>
</div>`, hostName, card, h.SiteURL)
		go h.Mailer.Send(hostEmail, "Booking confirmed – "+courtName, body)
	}

	h.Logger.Log(c.Request().Context(), "booking_created",
		fmt.Sprintf("Court %d on %s", req.CourtID, req.StartTime.Format("2006-01-02 15:04")),
		userID, c.RealIP())
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

	var ownerID string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT user_id FROM bookings WHERE id = $1`, id).Scan(&ownerID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "booking not found")
	}

	if ownerID != userID && role != "admin" && role != "board" {
		return echo.NewHTTPError(http.StatusForbidden, "cannot cancel another member's booking")
	}

	// Email all roster players before the booking is deleted
	if h.Mailer != nil {
		var courtName string
		var startTime, endTime time.Time
		h.DB.QueryRow(c.Request().Context(),
			`SELECT ct.name, b.start_time, b.end_time FROM bookings b
			 JOIN courts ct ON ct.id = b.court_id WHERE b.id = $1`, id,
		).Scan(&courtName, &startTime, &endTime)
		if courtName != "" {
			card := bookingCard(courtName, startTime, endTime, loadTimezone(c.Request().Context(), h.DB))
			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">❌ Booking Cancelled</h2>
  <p>The following court booking has been cancelled:</p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0">%s</div>
  <a href="%s/bookings" style="color:#15803d">View your bookings →</a>
</div>`, card, h.SiteURL)
			go h.emailRoster(id, "Booking cancelled – "+courtName, body)
		}
	}

	h.DB.Exec(c.Request().Context(), `DELETE FROM bookings WHERE id = $1`, id)
	h.Logger.Log(c.Request().Context(), "booking_cancelled", id, userID, c.RealIP())
	return c.NoContent(http.StatusNoContent)
}
