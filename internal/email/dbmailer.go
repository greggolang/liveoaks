package email

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DBMailer reads SMTP settings from the settings table on every send,
// falling back to Fallback's values for any missing keys.
type DBMailer struct {
	DB       *pgxpool.Pool
	Fallback *Mailer
}

func (m *DBMailer) build() *Mailer {
	s := map[string]string{}
	rows, err := m.DB.Query(context.Background(),
		`SELECT key, value FROM settings WHERE key LIKE 'smtp_%'`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			_ = rows.Scan(&k, &v)
			s[k] = v
		}
	}

	or := func(key, fallback string) string {
		if v, ok := s[key]; ok && v != "" {
			return v
		}
		return fallback
	}

	port := m.Fallback.Port
	if v, ok := s["smtp_port"]; ok && v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			port = p
		}
	}

	return &Mailer{
		Host:     or("smtp_host", m.Fallback.Host),
		Port:     port,
		Username: or("smtp_user", m.Fallback.Username),
		Password: or("smtp_pass", m.Fallback.Password),
		From:     or("smtp_from", m.Fallback.From),
	}
}

func (m *DBMailer) Send(to, subject, body string) error {
	return m.build().Send(to, subject, body)
}

func (m *DBMailer) SendPasswordReset(to, firstName, resetURL string) error {
	return m.build().SendPasswordReset(to, firstName, resetURL)
}

func (m *DBMailer) SendWelcome(to, firstName, siteURL string) error {
	return m.build().SendWelcome(to, firstName, siteURL)
}
