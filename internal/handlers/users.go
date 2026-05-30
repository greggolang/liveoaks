package handlers

import (
	"net/http"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type UsersHandler struct {
	DB *pgxpool.Pool
}

func (h *UsersHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, role, status, phone, created_at FROM users ORDER BY last_name, first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch users")
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Role, &u.Status, &u.Phone, &u.CreatedAt); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan user")
		}
		users = append(users, u)
	}
	return c.JSON(http.StatusOK, users)
}

func (h *UsersHandler) UpdateRole(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Role models.Role `json:"role"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if body.Role != models.RoleAdmin && body.Role != models.RoleBoard && body.Role != models.RoleMember {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid role")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, body.Role, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update role")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "role updated"})
}

func (h *UsersHandler) UpdateStatus(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Status models.Status `json:"status"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if body.Status != models.StatusActive && body.Status != models.StatusInactive && body.Status != models.StatusPending {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, body.Status, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update status")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "status updated"})
}

func (h *UsersHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request().Context(), `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete user")
	}
	return c.NoContent(http.StatusNoContent)
}
