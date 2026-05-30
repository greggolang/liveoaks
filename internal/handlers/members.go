package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type MembersHandler struct {
	DB *pgxpool.Pool
}

type MemberContact struct {
	ID        string    `json:"id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     string    `json:"email"`
	Phone     *string   `json:"phone,omitempty"`
	Address   *string   `json:"address,omitempty"`
	Family    *string   `json:"family,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *MembersHandler) Directory(c echo.Context) error {
	role, _ := c.Get("role").(string)
	boardRoles := map[string]bool{
		"admin": true, "president": true, "vice_president": true,
		"secretary": true, "treasurer": true, "entertainment": true, "house_grounds": true,
	}
	isBoard := boardRoles[role]

	var query string
	if isBoard {
		query = `SELECT id, first_name, last_name, email, phone, address, family, created_at
		         FROM users WHERE status = 'active' ORDER BY last_name, first_name`
	} else {
		query = `SELECT id, first_name, last_name, email, NULL, NULL, family, created_at
		         FROM users WHERE status = 'active' ORDER BY last_name, first_name`
	}

	rows, err := h.DB.Query(c.Request().Context(), query)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch members")
	}
	defer rows.Close()

	members := []MemberContact{}
	for rows.Next() {
		var m MemberContact
		if err := rows.Scan(&m.ID, &m.FirstName, &m.LastName, &m.Email, &m.Phone, &m.Address, &m.Family, &m.CreatedAt); err != nil {
			continue
		}
		members = append(members, m)
	}
	return c.JSON(http.StatusOK, members)
}
