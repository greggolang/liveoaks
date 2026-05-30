package handlers

import (
	"net/http"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type CourtsHandler struct {
	DB *pgxpool.Pool
}

func (h *CourtsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, name, number, has_ball_machine FROM courts ORDER BY number`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch courts")
	}
	defer rows.Close()

	courts := []models.Court{}
	for rows.Next() {
		var court models.Court
		if err := rows.Scan(&court.ID, &court.Name, &court.Number, &court.HasBallMachine); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan court")
		}
		courts = append(courts, court)
	}
	return c.JSON(http.StatusOK, courts)
}
