package handlers

import (
	"encoding/json"
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

	mu          sync.Mutex
	cached      []byte
	cachedAt    time.Time
	cachedLat   string
	cachedLon   string
	coordsAt    time.Time
	aqCached    []byte
	aqCachedAt  time.Time
}

// resolveCoords looks up lat/lon for a zip code using the free zippopotam.us API.
// Results are cached for 24 hours.
func (h *WeatherHandler) resolveCoords(zip string) (lat, lon string, err error) {
	h.mu.Lock()
	if h.cachedLat != "" && time.Since(h.coordsAt) < 24*time.Hour {
		lat, lon = h.cachedLat, h.cachedLon
		h.mu.Unlock()
		return
	}
	h.mu.Unlock()

	resp, err := http.Get("https://api.zippopotam.us/us/" + zip) //nolint:gosec
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("zip lookup failed: %d", resp.StatusCode)
	}

	var result struct {
		Places []struct {
			Latitude  string `json:"latitude"`
			Longitude string `json:"longitude"`
		} `json:"places"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Places) == 0 {
		return "", "", fmt.Errorf("invalid zip response")
	}

	lat = result.Places[0].Latitude
	lon = result.Places[0].Longitude

	h.mu.Lock()
	h.cachedLat = lat
	h.cachedLon = lon
	h.coordsAt = time.Now()
	h.mu.Unlock()
	return
}

func (h *WeatherHandler) Get(c echo.Context) error {
	h.mu.Lock()
	if h.cached != nil && time.Since(h.cachedAt) < 30*time.Minute {
		data := h.cached
		h.mu.Unlock()
		return c.JSONBlob(http.StatusOK, data)
	}
	h.mu.Unlock()

	// Prefer zip code; fall back to raw lat/lon settings
	var zip, lat, lon string
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_zip'`).Scan(&zip)

	if zip != "" {
		var err error
		lat, lon, err = h.resolveCoords(zip)
		if err != nil {
			// fall through to lat/lon fallback
			zip = ""
		}
	}
	if zip == "" {
		h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_lat'`).Scan(&lat)
		h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_lon'`).Scan(&lon)
	}
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

// AirQuality returns current US AQI from the Open-Meteo Air Quality API,
// using the same lat/lon settings as the weather endpoint. Cached 30 minutes.
func (h *WeatherHandler) AirQuality(c echo.Context) error {
	h.mu.Lock()
	if h.aqCached != nil && time.Since(h.aqCachedAt) < 30*time.Minute {
		data := h.aqCached
		h.mu.Unlock()
		return c.JSONBlob(http.StatusOK, data)
	}
	h.mu.Unlock()

	var zip, lat, lon string
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_zip'`).Scan(&zip)
	if zip != "" {
		lat, lon, _ = h.resolveCoords(zip)
	}
	if lat == "" {
		h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_lat'`).Scan(&lat)
		h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'weather_lon'`).Scan(&lon)
	}
	if lat == "" {
		lat = "34.1161"
	}
	if lon == "" {
		lon = "-118.1498"
	}

	url := fmt.Sprintf(
		"https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%s&longitude=%s"+
			"&current=us_aqi&timezone=America%%2FLos_Angeles",
		lat, lon,
	)

	resp, err := http.Get(url) //nolint:gosec
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "air quality unavailable")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not read air quality data")
	}

	h.mu.Lock()
	h.aqCached = body
	h.aqCachedAt = time.Now()
	h.mu.Unlock()

	return c.JSONBlob(http.StatusOK, body)
}
