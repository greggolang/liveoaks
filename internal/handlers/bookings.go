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
	Logger interface {
		Log(ctx context.Context, event, details, userID, ip string)
	}
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
	loc, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		loc = time.UTC
	}
	localStart := req.StartTime.In(loc)
	localEnd := req.EndTime.In(loc)
	if localStart.Hour() < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "bookings cannot start before 8:00 AM")
	}
	if localEnd.Hour() > 20 || (localEnd.Hour() == 20 && localEnd.Minute() > 0) {
		return echo.NewHTTPError(http.StatusBadRequest, "bookings must end by 8:00 PM")
	}

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
		`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time::date = $2::date`,
		userID, req.StartTime).Scan(&bookingsToday)
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
	err = h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO bookings (user_id, court_id, start_time, end_time, notes, match_type, players_needed)
		 VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7)
		 RETURNING id, user_id, court_id, start_time, end_time, notes, created_at`,
		userID, req.CourtID, req.StartTime, req.EndTime, req.Notes, req.MatchType, req.PlayersNeeded,
	).Scan(&booking.ID, &booking.UserID, &booking.CourtID, &booking.StartTime, &booking.EndTime, &booking.Notes, &booking.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "court already booked for that time")
	}

	// Add host to match roster
	var hostName string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name || ' ' || last_name FROM users WHERE id = $1`, userID).Scan(&hostName)
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO match_players (booking_id, user_id, player_name, is_host) VALUES ($1, $2, $3, true)`,
		booking.ID, userID, hostName)

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
	var currentStart, currentEnd time.Time
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT user_id, start_time, end_time FROM bookings WHERE id = $1`, id,
	).Scan(&ownerID, &currentStart, &currentEnd); err != nil {
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
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

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
		// Check for conflicts on the new end time (only matters if extending)
		var conflicts int
		h.DB.QueryRow(c.Request().Context(),
			`SELECT COUNT(*) FROM bookings
			 WHERE court_id = (SELECT court_id FROM bookings WHERE id = $1)
			   AND id != $1
			   AND start_time < $2
			   AND end_time > (SELECT start_time FROM bookings WHERE id = $1)`,
			id, newEnd,
		).Scan(&conflicts)
		if conflicts > 0 {
			return echo.NewHTTPError(http.StatusConflict, "court is already booked during that time")
		}
	}

	if req.MatchType == "" {
		req.MatchType = "casual"
	}

	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE bookings SET notes = NULLIF($1,''), match_type = $2, players_needed = $3, end_time = $4
		 WHERE id = $5`,
		req.Notes, req.MatchType, req.PlayersNeeded, newEnd, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update booking")
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

	h.DB.Exec(c.Request().Context(), `DELETE FROM bookings WHERE id = $1`, id)
	h.Logger.Log(c.Request().Context(), "booking_cancelled", id, userID, c.RealIP())
	return c.NoContent(http.StatusNoContent)
}
