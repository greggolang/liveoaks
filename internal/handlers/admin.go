package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type AdminHandler struct {
	DB     *pgxpool.Pool
	Mailer EmailTester
	SMS    SMSTester
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

// GetSessionConfig is a public endpoint — returns session, booking, kiosk, and branding config.
func (h *AdminHandler) GetSessionConfig(c echo.Context) error {
	var days, maxDaysAhead, kioskEnabled, clubLogo string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'session_timeout_days'`).Scan(&days)
	if days == "" {
		days = "0"
	}
	h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'booking_max_days_ahead'`).Scan(&maxDaysAhead)
	if maxDaysAhead == "" {
		maxDaysAhead = "5"
	}
	h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'kiosk_enabled'`).Scan(&kioskEnabled)
	if kioskEnabled == "" {
		kioskEnabled = "true"
	}
	h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'club_logo'`).Scan(&clubLogo)
	return c.JSON(http.StatusOK, map[string]string{
		"session_timeout_days":   days,
		"booking_max_days_ahead": maxDaysAhead,
		"kiosk_enabled":          kioskEnabled,
		"club_logo":              clubLogo,
	})
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
		// Never leak the raw API key to the browser; it has its own masked endpoint.
		if k == "anthropic_api_key" {
			continue
		}
		settings[k] = v
	}
	return c.JSON(http.StatusOK, settings)
}

// maskKey shows just enough of a secret to recognise it without revealing it.
func maskKey(k string) string {
	if k == "" {
		return ""
	}
	if len(k) <= 12 {
		return "••••••"
	}
	return k[:7] + "…" + k[len(k)-4:]
}

// GetAIConfig returns the Claude/Anthropic configuration with the API key masked.
func (h *AdminHandler) GetAIConfig(c echo.Context) error {
	ctx := c.Request().Context()
	var key, model, enabled string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'anthropic_api_key'`).Scan(&key)
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'claude_model'`).Scan(&model)
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'ai_enabled'`).Scan(&enabled)
	if model == "" {
		model = "claude-sonnet-4-6"
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"configured":  key != "",
		"key_preview": maskKey(key),
		"model":       model,
		"enabled":     enabled == "true",
	})
}

// UpdateAIConfig saves the Claude model and enabled flag, and (only when a new
// key is supplied) replaces the stored API key. An empty api_key string clears it.
func (h *AdminHandler) UpdateAIConfig(c echo.Context) error {
	var req struct {
		APIKey  *string `json:"api_key"`
		Model   string  `json:"model"`
		Enabled bool    `json:"enabled"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	ctx := c.Request().Context()
	upsert := func(k, v string) {
		h.DB.Exec(ctx, `INSERT INTO settings (key, value) VALUES ($1, $2)
		                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, k, v)
	}
	if req.APIKey != nil {
		if k := strings.TrimSpace(*req.APIKey); k == "" {
			h.DB.Exec(ctx, `DELETE FROM settings WHERE key = 'anthropic_api_key'`)
		} else {
			upsert("anthropic_api_key", k)
		}
	}
	if req.Model != "" {
		upsert("claude_model", req.Model)
	}
	if req.Enabled {
		upsert("ai_enabled", "true")
	} else {
		upsert("ai_enabled", "false")
	}
	return c.NoContent(http.StatusNoContent)
}

// GetAIUsage summarizes Claude spend for the admin settings page.
func (h *AdminHandler) GetAIUsage(c echo.Context) error {
	ctx := c.Request().Context()

	var monthToDate, last30, allTime float64
	var calls30 int
	h.DB.QueryRow(ctx, `SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage WHERE created_at >= date_trunc('month', NOW())`).Scan(&monthToDate)
	h.DB.QueryRow(ctx, `SELECT COALESCE(SUM(cost_usd),0), COUNT(*) FROM ai_usage WHERE created_at >= NOW() - INTERVAL '30 days'`).Scan(&last30, &calls30)
	h.DB.QueryRow(ctx, `SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage`).Scan(&allTime)

	type featureRow struct {
		Feature string  `json:"feature"`
		Cost    float64 `json:"cost"`
		Calls   int     `json:"calls"`
	}
	byFeature := []featureRow{}
	if rows, err := h.DB.Query(ctx, `
		SELECT feature, COALESCE(SUM(cost_usd),0), COUNT(*)
		FROM ai_usage WHERE created_at >= NOW() - INTERVAL '30 days'
		GROUP BY feature ORDER BY SUM(cost_usd) DESC`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var f featureRow
			if rows.Scan(&f.Feature, &f.Cost, &f.Calls) == nil {
				byFeature = append(byFeature, f)
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"month_to_date": monthToDate,
		"last_30_days":  last30,
		"all_time":      allTime,
		"calls_30_days": calls30,
		"by_feature":    byFeature,
	})
}

// TestAIConfig verifies an API key against Anthropic's models endpoint (a free
// call that spends no tokens). It tests the supplied key if given, otherwise the
// stored one.
func (h *AdminHandler) TestAIConfig(c echo.Context) error {
	ctx := c.Request().Context()
	var req struct {
		APIKey string `json:"api_key"`
	}
	c.Bind(&req)
	key := strings.TrimSpace(req.APIKey)
	if key == "" {
		h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'anthropic_api_key'`).Scan(&key)
	}
	if key == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": "No API key configured."})
	}

	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.anthropic.com/v1/models", nil)
	httpReq.Header.Set("x-api-key", key)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(httpReq)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": "Could not reach Anthropic: " + err.Error()})
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
	io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	msg := fmt.Sprintf("Anthropic returned HTTP %d.", resp.StatusCode)
	if resp.StatusCode == http.StatusUnauthorized {
		msg = "Invalid API key (401 Unauthorized)."
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": msg})
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

type EmailTester interface {
	Send(to, subject, body string) error
}

type SMSTester interface {
	Send(to, body string) error
}

func (h *AdminHandler) TestEmail(c echo.Context) error {
	var req struct {
		To string `json:"to"`
	}
	if err := c.Bind(&req); err != nil || req.To == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email address required")
	}
	if h.Mailer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "email not configured")
	}
	err := h.Mailer.Send(req.To, "Test Email — Liveoaks Tennis Club",
		`<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
		  <h2 style="color:#15803d">🎾 Liveoaks Tennis Club</h2>
		  <p>This is a test email from the Liveoaks admin panel.</p>
		  <p>If you received this, email delivery is working correctly.</p>
		  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
		  <p style="color:#9ca3af;font-size:12px">Sent from Liveoaks Tennis Club admin panel.</p>
		</div>`)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) TestSMS(c echo.Context) error {
	var req struct {
		To string `json:"to"`
	}
	if err := c.Bind(&req); err != nil || req.To == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "phone number required")
	}
	if h.SMS == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "SMS not configured")
	}
	err := h.SMS.Send(req.To, "Liveoaks Tennis Club: this is a test message. SMS delivery is working.")
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// GetSiteContent returns the public-website content JSON. Public (no auth) so
// the landing page can render it. Returns {} when nothing has been saved yet.
func (h *AdminHandler) GetSiteContent(c echo.Context) error {
	var val string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT value FROM settings WHERE key = 'public_site_content'`).Scan(&val)
	if strings.TrimSpace(val) == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{})
	}
	return c.Blob(http.StatusOK, "application/json", []byte(val))
}

// SaveSiteContent stores the public-website content JSON (board+).
func (h *AdminHandler) SaveSiteContent(c echo.Context) error {
	body, err := io.ReadAll(c.Request().Body)
	if err != nil || len(body) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "empty body")
	}
	if !json.Valid(body) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON")
	}
	_, err = h.DB.Exec(c.Request().Context(),
		`INSERT INTO settings (key, value) VALUES ('public_site_content', $1)
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, string(body))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save content")
	}
	return c.NoContent(http.StatusNoContent)
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
		`INSERT INTO settings (key, value) VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
		key, body.Value)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update setting")
	}
	return c.JSON(http.StatusOK, map[string]string{"key": key, "value": body.Value})
}

// SMTPPing tries a raw TCP connection to the configured SMTP host:port.
// Returns success/failure so the frontend can distinguish firewall blocks
// from credential problems without actually sending an email.
func (h *AdminHandler) SMTPPing(c echo.Context) error {
	host, port := "", "587"
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'smtp_host'`).Scan(&host)
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key = 'smtp_port'`).Scan(&port)
	if host == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"ok": false, "message": "SMTP host is not configured — save your settings first.",
		})
	}
	addr := fmt.Sprintf("%s:%s", host, port)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"ok": false, "message": fmt.Sprintf("Cannot reach %s — %v", addr, err),
		})
	}
	conn.Close()
	return c.JSON(http.StatusOK, map[string]interface{}{
		"ok": true, "message": fmt.Sprintf("TCP connection to %s succeeded. Port is open.", addr),
	})
}
