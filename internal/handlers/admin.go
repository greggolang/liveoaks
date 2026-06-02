package handlers

import (
	"fmt"
	"net"
	"net/http"
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
