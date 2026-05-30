package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type AdminHandler struct {
	DB *pgxpool.Pool
}

func (h *AdminHandler) ActivityLog(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT a.id, a.event, a.details, a.ip, a.created_at,
		        COALESCE(u.first_name || ' ' || u.last_name, 'System') as actor
		 FROM activity_log a
		 LEFT JOIN users u ON u.id = a.user_id
		 ORDER BY a.created_at DESC
		 LIMIT 200`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch logs")
	}
	defer rows.Close()

	type Entry struct {
		ID        string    `json:"id"`
		Event     string    `json:"event"`
		Details   *string   `json:"details"`
		IP        *string   `json:"ip"`
		CreatedAt time.Time `json:"created_at"`
		Actor     string    `json:"actor"`
	}
	entries := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.Event, &e.Details, &e.IP, &e.CreatedAt, &e.Actor); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return c.JSON(http.StatusOK, entries)
}

func (h *AdminHandler) GetSettings(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT key, value FROM settings ORDER BY key`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch settings")
	}
	defer rows.Close()

	settings := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan setting")
		}
		settings[k] = v
	}
	return c.JSON(http.StatusOK, settings)
}

func (h *AdminHandler) PendingResets(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT pr.token, u.first_name, u.last_name, u.email, pr.expires_at
		 FROM password_resets pr
		 JOIN users u ON u.id = pr.user_id
		 WHERE pr.expires_at > NOW()
		 ORDER BY pr.expires_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch resets")
	}
	defer rows.Close()

	type Reset struct {
		Token     string    `json:"token"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
		Email     string    `json:"email"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	resets := []Reset{}
	for rows.Next() {
		var r Reset
		if err := rows.Scan(&r.Token, &r.FirstName, &r.LastName, &r.Email, &r.ExpiresAt); err != nil {
			continue
		}
		resets = append(resets, r)
	}
	return c.JSON(http.StatusOK, resets)
}

func (h *AdminHandler) UpdateSetting(c echo.Context) error {
	key := c.Param("key")
	var body struct {
		Value string `json:"value"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2`, body.Value, key)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update setting")
	}
	return c.JSON(http.StatusOK, map[string]string{"key": key, "value": body.Value})
}
