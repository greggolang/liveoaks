package handlers

import (
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type WeatherHandler struct {
	DB *pgxpool.Pool

	mu       sync.Mutex
	cached   []byte
	cachedAt time.Time
}

func (h *WeatherHandler) Get(c echo.Context) error {
	h.mu.Lock()
	if h.cached != nil && time.Since(h.cachedAt) < 30*time.Minute {
		data := h.cached
		h.mu.Unlock()
		return c.JSONBlob(http.StatusOK, data)
	}
	h.mu.Unlock()

	var lat, lon string
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_lat'`).Scan(&lat)
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_lon'`).Scan(&lon)
	if lat == "" {
		lat = "34.1161"
	}
	if lon == "" {
		lon = "-118.1498"
	}

	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"+
			"&current=temperature_2m,precipitation,weathercode,windspeed_10m,relativehumidity_2m"+
			"&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max"+
			"&temperature_unit=fahrenheit&windspeed_unit=mph"+
			"&timezone=America%%2FLos_Angeles&forecast_days=7",
		lat, lon,
	)

	resp, err := http.Get(url) //nolint:gosec
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "weather unavailable")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not read weather data")
	}

	h.mu.Lock()
	h.cached = body
	h.cachedAt = time.Now()
	h.mu.Unlock()

	return c.JSONBlob(http.StatusOK, body)
}
