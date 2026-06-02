package sms

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DBSender reads Twilio settings from the settings table on every send,
// falling back to Fallback's values for any missing keys. This mirrors
// email.DBMailer so credentials can be edited in the admin panel without a
// redeploy.
type DBSender struct {
	DB       *pgxpool.Pool
	Fallback *Sender
}

func (s *DBSender) build() *Sender {
	vals := map[string]string{}
	rows, err := s.DB.Query(context.Background(),
		`SELECT key, value FROM settings WHERE key LIKE 'twilio_%'`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			_ = rows.Scan(&k, &v)
			vals[k] = v
		}
	}

	or := func(key, fallback string) string {
		if v, ok := vals[key]; ok && v != "" {
			return v
		}
		return fallback
	}

	return &Sender{
		AccountSID: or("twilio_account_sid", s.Fallback.AccountSID),
		AuthToken:  or("twilio_auth_token", s.Fallback.AuthToken),
		From:       or("twilio_from", s.Fallback.From),
	}
}

func (s *DBSender) Configured() bool { return s.build().Configured() }

func (s *DBSender) Send(to, body string) error { return s.build().Send(to, body) }
