package handlers

import (
	"context"
	"fmt"
	"net/http"
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

	query := `
		SELECT b.id, b.user_id, b.court_id, b.start_time, b.end_time, b.notes, b.created_at,
		       u.first_name, u.last_name, ct.name, ct.number
		FROM bookings b
		JOIN users u ON u.id = b.user_id
		JOIN courts ct ON ct.id = b.court_id`

	if date != "" {
		rows, err = h.DB.Query(c.Request().Context(),
			query+` WHERE b.start_time::date = $1 ORDER BY b.start_time`, date)
	} else {
		rows, err = h.DB.Query(c.Request().Context(),
			query+` WHERE b.start_time >= NOW() ORDER BY b.start_time LIMIT 100`)
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
			&b.User.FirstName, &b.User.LastName, &b.Court.Name, &b.Court.Number); err != nil {
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
