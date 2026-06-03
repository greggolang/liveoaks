package email

import (
	"crypto/tls"
	"fmt"
	"time"

	gomail "gopkg.in/mail.v2"
)

type Mailer struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	SiteURL  string // used to build the logo image URL in branded emails
}

// brand wraps an email body with the Live Oaks Tennis Association crest at the
// top and the association footer at the bottom, so every outgoing email is
// consistently branded. The logo is loaded from the public site URL.
func (m *Mailer) brand(body string) string {
	header := ""
	if m.SiteURL != "" {
		header = fmt.Sprintf(`<div style="text-align:center;margin:8px 0 16px"><img src="%s/lota-logo.png" alt="Live Oaks Tennis Association" width="84" height="84" style="width:84px;height:84px" /></div>`, m.SiteURL)
	}
	footer := `<div style="text-align:center;margin-top:20px"><div style="color:#166534;font-weight:600">Live Oaks Tennis Association</div><div style="color:#9ca3af;font-size:12px;margin-top:2px">South Pasadena, California · Founded 1912</div></div>`
	return header + body + footer
}

func (m *Mailer) Send(to, subject, body string) error {
	msg := gomail.NewMessage()
	msg.SetHeader("From", fmt.Sprintf("Liveoaks Tennis Club <%s>", m.From))
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetBody("text/html", m.brand(body))

	// Use the configured hostname for TLS verification even when falling back to
	// localhost — the mail server cert is issued for the external hostname.
	tlsCfg := &tls.Config{ServerName: m.Host}

	hosts := []string{m.Host, "localhost"}
	if m.Host == "" || m.Host == "localhost" || m.Host == "127.0.0.1" {
		hosts = []string{m.Host}
	}

	var lastErr error
	for _, host := range hosts {
		d := gomail.NewDialer(host, m.Port, m.Username, m.Password)
		d.TLSConfig = tlsCfg
		d.Timeout = 15 * time.Second
		if m.Username == "" {
			d.Auth = nil
		}
		if lastErr = d.DialAndSend(msg); lastErr == nil {
			return nil
		}
	}
	return lastErr
}

func (m *Mailer) SendPasswordReset(to, firstName, resetURL string) error {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Liveoaks Tennis Club</h2>
  <p>Hi %s,</p>
  <p>We received a request to reset your password. Click the button below to set a new one:</p>
  <p style="margin:32px 0">
    <a href="%s" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
      Reset My Password
    </a>
  </p>
  <p style="color:#6b7280;font-size:13px">This link expires in 24 hours. If you didn't request a reset, you can ignore this email.</p>
  <p style="color:#6b7280;font-size:13px">Or copy this link: %s</p>
</div>`, firstName, resetURL, resetURL)

	return m.Send(to, "Reset your Liveoaks password", body)
}

func (m *Mailer) SendWelcome(to, firstName, siteURL string) error {
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Welcome to Liveoaks Tennis Club!</h2>
  <p>Hi %s,</p>
  <p>Your membership has been approved. You can now log in and book courts.</p>
  <p style="margin:32px 0">
    <a href="%s/login" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
      Sign In
    </a>
  </p>
  <p style="color:#6b7280;font-size:13px">Your default password is <strong>LiveOaks2026!</strong> — please change it after your first login.</p>
</div>`, firstName, siteURL)

	return m.Send(to, "Your Liveoaks membership is approved", body)
}
