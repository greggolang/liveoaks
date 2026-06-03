package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
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

// ─── Alert rules ──────────────────────────────────────────────────────────────

type yoRule struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Enabled         bool       `json:"enabled"`
	Priority        int        `json:"priority"`
	DeviceID        *string    `json:"device_id"`
	DeviceType      *string    `json:"device_type"`
	EventContains   *string    `json:"event_contains"`
	StateEquals     *string    `json:"state_equals"`
	ActiveStartTime *string    `json:"active_start_time"`
	ActiveEndTime   *string    `json:"active_end_time"`
	ActiveDays      *int       `json:"active_days"`
	CooldownMinutes *int       `json:"cooldown_minutes"`
	LastFiredAt     *time.Time `json:"last_fired_at"`
	StopProcessing  bool       `json:"stop_processing"`
	Notes           *string    `json:"notes"`
	RecipientScope  string     `json:"recipient_scope"`
	RecipientRole   *string    `json:"recipient_role"`
	RecipientUserID *string    `json:"recipient_user_id"`
	NotifyDashboard bool       `json:"notify_dashboard"`
	NotifyEmail     bool       `json:"notify_email"`
	NotifySMS       bool       `json:"notify_sms"`
	AlertType       string     `json:"alert_type"`
	MessageTemplate *string    `json:"message_template"`
	CreatedAt       time.Time  `json:"created_at"`
}

func nilIfEmpty(p *string) *string {
	if p == nil || strings.TrimSpace(*p) == "" {
		return nil
	}
	v := strings.TrimSpace(*p)
	return &v
}

// normalizeRule applies defaults and converts empty match/recipient fields to NULL.
func normalizeRule(r *yoRule) {
	switch r.RecipientScope {
	case "all_members", "board", "role", "user":
	default:
		r.RecipientScope = "board"
	}
	switch r.AlertType {
	case "info", "warning", "danger":
	default:
		r.AlertType = "warning"
	}
	r.DeviceID = nilIfEmpty(r.DeviceID)
	r.DeviceType = nilIfEmpty(r.DeviceType)
	r.EventContains = nilIfEmpty(r.EventContains)
	r.StateEquals = nilIfEmpty(r.StateEquals)
	r.ActiveStartTime = nilIfEmpty(r.ActiveStartTime)
	r.ActiveEndTime = nilIfEmpty(r.ActiveEndTime)
	if r.ActiveDays != nil && *r.ActiveDays == 0 {
		r.ActiveDays = nil
	}
	if r.CooldownMinutes != nil && *r.CooldownMinutes <= 0 {
		r.CooldownMinutes = nil
	}
	r.Notes = nilIfEmpty(r.Notes)
	r.MessageTemplate = nilIfEmpty(r.MessageTemplate)
	if r.Priority == 0 {
		r.Priority = 100
	}
	if r.RecipientScope == "role" {
		r.RecipientRole = nilIfEmpty(r.RecipientRole)
	} else {
		r.RecipientRole = nil
	}
	if r.RecipientScope == "user" {
		r.RecipientUserID = nilIfEmpty(r.RecipientUserID)
	} else {
		r.RecipientUserID = nil
	}
}

func (h *YoLinkHandler) ListRules(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, name, enabled, priority,
		       device_id, device_type, event_contains, state_equals,
		       active_start_time, active_end_time, active_days,
		       cooldown_minutes, last_fired_at,
		       stop_processing, notes,
		       recipient_scope, recipient_role, recipient_user_id,
		       notify_dashboard, notify_email, notify_sms, alert_type, message_template, created_at
		FROM yolink_alert_rules ORDER BY priority ASC, created_at ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch rules")
	}
	defer rows.Close()
	rules := []yoRule{}
	for rows.Next() {
		var r yoRule
		if err := rows.Scan(
			&r.ID, &r.Name, &r.Enabled, &r.Priority,
			&r.DeviceID, &r.DeviceType, &r.EventContains, &r.StateEquals,
			&r.ActiveStartTime, &r.ActiveEndTime, &r.ActiveDays,
			&r.CooldownMinutes, &r.LastFiredAt,
			&r.StopProcessing, &r.Notes,
			&r.RecipientScope, &r.RecipientRole, &r.RecipientUserID,
			&r.NotifyDashboard, &r.NotifyEmail, &r.NotifySMS, &r.AlertType, &r.MessageTemplate, &r.CreatedAt,
		); err != nil {
			continue
		}
		rules = append(rules, r)
	}
	return c.JSON(http.StatusOK, rules)
}

func (h *YoLinkHandler) CreateRule(c echo.Context) error {
	var r yoRule
	if err := c.Bind(&r); err != nil || strings.TrimSpace(r.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	normalizeRule(&r)
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO yolink_alert_rules
		    (name, enabled, priority,
		     device_id, device_type, event_contains, state_equals,
		     active_start_time, active_end_time, active_days,
		     cooldown_minutes, stop_processing, notes,
		     recipient_scope, recipient_role, recipient_user_id,
		     notify_dashboard, notify_email, notify_sms, alert_type, message_template)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		RETURNING id, created_at`,
		r.Name, r.Enabled, r.Priority,
		r.DeviceID, r.DeviceType, r.EventContains, r.StateEquals,
		r.ActiveStartTime, r.ActiveEndTime, r.ActiveDays,
		r.CooldownMinutes, r.StopProcessing, r.Notes,
		r.RecipientScope, r.RecipientRole, r.RecipientUserID,
		r.NotifyDashboard, r.NotifyEmail, r.NotifySMS, r.AlertType, r.MessageTemplate,
	).Scan(&r.ID, &r.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create rule")
	}
	return c.JSON(http.StatusCreated, r)
}

func (h *YoLinkHandler) UpdateRule(c echo.Context) error {
	id := c.Param("id")
	var r yoRule
	if err := c.Bind(&r); err != nil || strings.TrimSpace(r.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	normalizeRule(&r)
	ct, err := h.DB.Exec(c.Request().Context(), `
		UPDATE yolink_alert_rules SET
		    name = $1, enabled = $2, priority = $3,
		    device_id = $4, device_type = $5, event_contains = $6, state_equals = $7,
		    active_start_time = $8, active_end_time = $9, active_days = $10,
		    cooldown_minutes = $11, stop_processing = $12, notes = $13,
		    recipient_scope = $14, recipient_role = $15, recipient_user_id = $16,
		    notify_dashboard = $17, notify_email = $18, notify_sms = $19,
		    alert_type = $20, message_template = $21, updated_at = NOW()
		WHERE id = $22`,
		r.Name, r.Enabled, r.Priority,
		r.DeviceID, r.DeviceType, r.EventContains, r.StateEquals,
		r.ActiveStartTime, r.ActiveEndTime, r.ActiveDays,
		r.CooldownMinutes, r.StopProcessing, r.Notes,
		r.RecipientScope, r.RecipientRole, r.RecipientUserID,
		r.NotifyDashboard, r.NotifyEmail, r.NotifySMS, r.AlertType, r.MessageTemplate, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update rule")
	}
	if ct.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "rule not found")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *YoLinkHandler) DeleteRule(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM yolink_alert_rules WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// TestRule fires a rule on demand and reports how many recipients were notified.
func (h *YoLinkHandler) TestRule(c echo.Context) error {
	n, err := h.Service.TestRule(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"recipients": n})
}
