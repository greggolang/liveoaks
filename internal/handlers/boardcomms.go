package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BoardCommsHandler struct {
	DB *pgxpool.Pool
}

func (h *BoardCommsHandler) List(c echo.Context) error {
	return c.JSON(http.StatusOK, []any{})
}

func (h *BoardCommsHandler) BoardMembers(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, role FROM users
		 WHERE role NOT IN ('member','inactive') ORDER BY last_name, first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	type member struct {
		ID        string `json:"id"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Role      string `json:"role"`
	}
	members := []member{}
	for rows.Next() {
		var m member
		if rows.Scan(&m.ID, &m.FirstName, &m.LastName, &m.Email, &m.Role) == nil {
			members = append(members, m)
		}
	}
	return c.JSON(http.StatusOK, members)
}
