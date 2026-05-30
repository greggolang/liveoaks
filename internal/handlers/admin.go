package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type AdminHandler struct {
	DB *pgxpool.Pool
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
