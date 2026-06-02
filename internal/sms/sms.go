// Package sms sends transactional text messages to members via Twilio.
//
// It deliberately talks to the Twilio REST API directly over net/http rather
// than pulling in the (large) official SDK — sending a message is a single
// authenticated POST, which keeps go.mod lean and mirrors the self-contained
// style of the email package.
package sms

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Sender holds Twilio credentials and the originating phone number.
type Sender struct {
	AccountSID string
	AuthToken  string
	From       string // E.164 sending number, e.g. +14155551234
}

// Configured reports whether enough credentials are present to send.
func (s *Sender) Configured() bool {
	return s.AccountSID != "" && s.AuthToken != "" && s.From != ""
}

// Send delivers a plain-text message to a single recipient. The recipient
// number is normalized to E.164 (assuming US/+1 when no country code is given)
// so the various phone formats stored on member records all work.
func (s *Sender) Send(to, body string) error {
	if !s.Configured() {
		return fmt.Errorf("SMS not configured — set Twilio account SID, auth token, and from number")
	}
	dest := normalizeE164(to)
	if dest == "" {
		return fmt.Errorf("invalid phone number: %q", to)
	}

	form := url.Values{}
	form.Set("To", dest)
	form.Set("From", s.From)
	form.Set("Body", body)

	endpoint := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", s.AccountSID)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(s.AccountSID, s.AuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach Twilio: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("Twilio returned %s: %s", resp.Status, strings.TrimSpace(string(respBody)))
}

// normalizeE164 reduces a phone string to E.164. It keeps a leading "+" if the
// caller already supplied one; otherwise it assumes a US number and prefixes
// the country code. Returns "" if the digits don't form a plausible number.
func normalizeE164(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	hasPlus := strings.HasPrefix(raw, "+")

	var digits strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	d := digits.String()
	if d == "" {
		return ""
	}

	if hasPlus {
		return "+" + d
	}
	switch len(d) {
	case 10: // bare US number
		return "+1" + d
	case 11: // US number already carrying the country code
		if strings.HasPrefix(d, "1") {
			return "+" + d
		}
	}
	return "+" + d
}
