package email

import (
	"fmt"

	gomail "gopkg.in/mail.v2"
)

type Mailer struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

func (m *Mailer) Send(to, subject, body string) error {
	msg := gomail.NewMessage()
	msg.SetHeader("From", fmt.Sprintf("Liveoaks Tennis Club <%s>", m.From))
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetBody("text/html", body)

	// IP-based auth: no username/password needed
	d := gomail.NewDialer(m.Host, m.Port, "", "")
	return d.DialAndSend(msg)
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
