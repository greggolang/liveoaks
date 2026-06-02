package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/greggolang/liveoaks/internal/yolink"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type YoLinkHandler struct {
	DB      *pgxpool.Pool
	Service *yolink.Service
}

func (h *YoLinkHandler) GetConfig(c echo.Context) error {
	var clientID string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'yolink_client_id'`).Scan(&clientID)
	return c.JSON(http.StatusOK, map[string]string{"client_id": clientID})
}

func (h *YoLinkHandler) UpdateConfig(c echo.Context) error {
	var body struct {
		ClientID  string `json:"client_id"`
		SecretKey string `json:"secret_key"`
	}
	if err := c.Bind(&body); err != nil || body.ClientID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "client_id required")
	}
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO settings (key, value) VALUES ('yolink_client_id', $1)
		 ON CONFLICT (key) DO UPDATE SET value = $1`, body.ClientID)
	if body.SecretKey != "" {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO settings (key, value) VALUES ('yolink_secret_key', $1)
			 ON CONFLICT (key) DO UPDATE SET value = $1`, body.SecretKey)
	}
	h.Service.Reload()
	return c.JSON(http.StatusOK, map[string]string{"message": "saved"})
}

func (h *YoLinkHandler) SyncDevices(c echo.Context) error {
	if err := h.Service.SyncDevices(c.Request().Context()); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "synced"})
}

type yoDevice struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Type          string          `json:"type"`
	Model         *string         `json:"model"`
	State         json.RawMessage `json:"state"`
	AlertsEnabled bool            `json:"alerts_enabled"`
	LastSeenAt    *time.Time      `json:"last_seen_at"`
	CreatedAt     time.Time       `json:"created_at"`
}

func (h *YoLinkHandler) ListDevices(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, name, type, model, state, alerts_enabled, last_seen_at, created_at
		 FROM yolink_devices ORDER BY name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch devices")
	}
	defer rows.Close()
	devices := []yoDevice{}
	for rows.Next() {
		var d yoDevice
		var stateBytes []byte
		if err := rows.Scan(&d.ID, &d.Name, &d.Type, &d.Model, &stateBytes,
			&d.AlertsEnabled, &d.LastSeenAt, &d.CreatedAt); err != nil {
			continue
		}
		d.State = json.RawMessage(stateBytes)
		devices = append(devices, d)
	}
	return c.JSON(http.StatusOK, devices)
}

func (h *YoLinkHandler) UpdateDevice(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Name          string `json:"name"`
		AlertsEnabled bool   `json:"alerts_enabled"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	h.DB.Exec(c.Request().Context(),
		`UPDATE yolink_devices SET name = $1, alerts_enabled = $2, updated_at = NOW() WHERE id = $3`,
		body.Name, body.AlertsEnabled, id)
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

type yoAlert struct {
	ID         string          `json:"id"`
	DeviceID   string          `json:"device_id"`
	DeviceName string          `json:"device_name"`
	EventType  string          `json:"event_type"`
	RawEvent   string          `json:"raw_event"`
	Data       json.RawMessage `json:"data"`
	CreatedAt  time.Time       `json:"created_at"`
}

func (h *YoLinkHandler) ListAlerts(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, device_id, device_name, event_type, raw_event, data, created_at
		 FROM yolink_alerts ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch alerts")
	}
	defer rows.Close()
	alerts := []yoAlert{}
	for rows.Next() {
		var a yoAlert
		var dataBytes []byte
		if err := rows.Scan(&a.ID, &a.DeviceID, &a.DeviceName, &a.EventType,
			&a.RawEvent, &dataBytes, &a.CreatedAt); err != nil {
			continue
		}
		a.Data = json.RawMessage(dataBytes)
		alerts = append(alerts, a)
	}
	return c.JSON(http.StatusOK, alerts)
}
