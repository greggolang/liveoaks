package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type GuestsHandler struct {
	DB *pgxpool.Pool
}

type GuestPass struct {
	ID        string    `json:"id"`
	MemberID  string    `json:"member_id"`
	GuestName string    `json:"guest_name"`
	GuestEmail *string  `json:"guest_email,omitempty"`
	CourtID   *int      `json:"court_id,omitempty"`
	VisitDate time.Time `json:"visit_date"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	MemberFirstName string `json:"member_first_name,omitempty"`
	MemberLastName  string `json:"member_last_name,omitempty"`
}

func (h *GuestsHandler) Log(c echo.Context) error {
	memberID := c.Get("user_id").(string)
	var req struct {
		GuestName  string `json:"guest_name"`
		GuestEmail string `json:"guest_email"`
		CourtID    *int   `json:"court_id"`
		VisitDate  string `json:"visit_date"`
		Notes      string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.GuestName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "guest name required")
	}
	date := req.VisitDate
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	var gp GuestPass
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO guest_passes (member_id, guest_name, guest_email, court_id, visit_date, notes)
		 VALUES ($1, $2, NULLIF($3,''), $4, $5::date, NULLIF($6,''))
		 RETURNING id, member_id, guest_name, guest_email, court_id, visit_date, notes, created_at`,
		memberID, req.GuestName, req.GuestEmail, req.CourtID, date, req.Notes,
	).Scan(&gp.ID, &gp.MemberID, &gp.GuestName, &gp.GuestEmail, &gp.CourtID, &gp.VisitDate, &gp.Notes, &gp.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not log guest")
	}
	return c.JSON(http.StatusCreated, gp)
}

func (h *GuestsHandler) MyGuests(c echo.Context) error {
	memberID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, member_id, guest_name, guest_email, court_id, visit_date, notes, created_at
		 FROM guest_passes WHERE member_id = $1 ORDER BY visit_date DESC LIMIT 50`, memberID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch guests")
	}
	defer rows.Close()
	guests := []GuestPass{}
	for rows.Next() {
		var gp GuestPass
		if err := rows.Scan(&gp.ID, &gp.MemberID, &gp.GuestName, &gp.GuestEmail, &gp.CourtID, &gp.VisitDate, &gp.Notes, &gp.CreatedAt); err != nil {
			continue
		}
		guests = append(guests, gp)
	}
	return c.JSON(http.StatusOK, guests)
}

func (h *GuestsHandler) AdminList(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT gp.id, gp.member_id, gp.guest_name, gp.guest_email, gp.court_id, gp.visit_date, gp.notes, gp.created_at,
		        u.first_name, u.last_name
		 FROM guest_passes gp JOIN users u ON u.id = gp.member_id
		 ORDER BY gp.visit_date DESC LIMIT 200`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch guests")
	}
	defer rows.Close()
	guests := []GuestPass{}
	for rows.Next() {
		var gp GuestPass
		if err := rows.Scan(&gp.ID, &gp.MemberID, &gp.GuestName, &gp.GuestEmail, &gp.CourtID, &gp.VisitDate, &gp.Notes, &gp.CreatedAt,
			&gp.MemberFirstName, &gp.MemberLastName); err != nil {
			continue
		}
		guests = append(guests, gp)
	}
	return c.JSON(http.StatusOK, guests)
}
