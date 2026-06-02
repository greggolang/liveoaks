package handlers

import (
	"crypto/tls"
	"fmt"
	"html"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	imapclient "github.com/emersion/go-imap/client"
	gomessage "github.com/emersion/go-message/mail"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	gomail "gopkg.in/mail.v2"
)

type IMAPHandler struct {
	DB *pgxpool.Pool
}

type MailSummary struct {
	UID     uint32 `json:"uid"`
	Subject string `json:"subject"`
	From    string `json:"from"`
	Date    string `json:"date"`
	Unread  bool   `json:"unread"`
}

type MailDetail struct {
	UID     uint32 `json:"uid"`
	Subject string `json:"subject"`
	From    string `json:"from"`
	To      string `json:"to"`
	Cc      string `json:"cc,omitempty"`
	Date    string `json:"date"`
	Body    string `json:"body"`
	Unread  bool   `json:"unread"`
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (h *IMAPHandler) creds(c echo.Context) (address, password, host string, err error) {
	ctx := c.Request().Context()
	userID := c.Get("user_id").(string)

	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'imap_host'`).Scan(&host)
	if host == "" {
		host = "mail.webgoserver.com"
	}

	err = h.DB.QueryRow(ctx, `
		SELECT address, imap_password FROM mail_accounts
		WHERE assigned_user_id = $1 AND active = true
		ORDER BY created_at LIMIT 1
	`, userID).Scan(&address, &password)
	if err != nil || address == "" {
		return "", "", "", fmt.Errorf("no mail account assigned to your user — ask an admin to set one up in Admin → Mail")
	}
	if password == "" {
		return "", "", "", fmt.Errorf("mailbox password not set — ask an admin to click Reset Password in Admin → Mail")
	}
	return address, password, host, nil
}

func imapConnect(host, address, password string) (*imapclient.Client, error) {
	var c *imapclient.Client
	var err error

	tlsCfg := &tls.Config{ServerName: host}
	c, err = imapclient.DialTLS(host+":993", tlsCfg)
	if err != nil {
		c, err = imapclient.Dial(host + ":143")
		if err != nil {
			return nil, fmt.Errorf("cannot connect to mail server at %s: %w", host, err)
		}
		if err = c.StartTLS(tlsCfg); err != nil {
			c.Logout()
			return nil, fmt.Errorf("TLS handshake failed: %w", err)
		}
	}
	if err = c.Login(address, password); err != nil {
		c.Logout()
		return nil, fmt.Errorf("IMAP login failed — check credentials in Admin → Mail")
	}
	return c, nil
}

func formatAddr(addrs []*imap.Address) string {
	if len(addrs) == 0 {
		return ""
	}
	parts := make([]string, 0, len(addrs))
	for _, a := range addrs {
		email := a.MailboxName + "@" + a.HostName
		if a.PersonalName != "" {
			parts = append(parts, a.PersonalName+" <"+email+">")
		} else {
			parts = append(parts, email)
		}
	}
	return strings.Join(parts, ", ")
}

func extractIMAPBody(r io.Reader) string {
	mr, err := gomessage.CreateReader(r)
	if err != nil {
		return ""
	}
	var htmlBody, textBody string
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		inline, ok := p.Header.(*gomessage.InlineHeader)
		if !ok {
			continue
		}
		ct, _, _ := inline.ContentType()
		b, _ := io.ReadAll(p.Body)
		switch ct {
		case "text/html":
			if htmlBody == "" {
				htmlBody = string(b)
			}
		case "text/plain":
			if textBody == "" {
				textBody = "<pre style='white-space:pre-wrap;font-family:inherit'>" +
					html.EscapeString(string(b)) + "</pre>"
			}
		}
	}
	if htmlBody != "" {
		return htmlBody
	}
	return textBody
}

// ─── endpoints ───────────────────────────────────────────────────────────────

// ListMessages returns the most recent 50 messages in a folder (default INBOX).
func (h *IMAPHandler) ListMessages(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	folder := c.QueryParam("folder")
	if folder == "" {
		folder = "INBOX"
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	mbox, err := ic.Select(folder, true)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	if mbox.Messages == 0 {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"messages": []MailSummary{},
			"mailbox":  address,
			"total":    0,
		})
	}

	from := uint32(1)
	if mbox.Messages > 50 {
		from = mbox.Messages - 49
	}
	seqset := new(imap.SeqSet)
	seqset.AddRange(from, mbox.Messages)

	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchFlags, imap.FetchUid}
	ch := make(chan *imap.Message, 50)
	done := make(chan error, 1)
	go func() { done <- ic.Fetch(seqset, items, ch) }()

	var summaries []MailSummary
	for msg := range ch {
		if msg.Envelope == nil {
			continue
		}
		unread := true
		for _, f := range msg.Flags {
			if f == imap.SeenFlag {
				unread = false
				break
			}
		}
		date := ""
		if !msg.Envelope.Date.IsZero() {
			date = msg.Envelope.Date.Format(time.RFC3339)
		}
		summaries = append(summaries, MailSummary{
			UID:     msg.Uid,
			Subject: msg.Envelope.Subject,
			From:    formatAddr(msg.Envelope.From),
			Date:    date,
			Unread:  unread,
		})
	}
	if err := <-done; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "fetch failed: "+err.Error())
	}

	// Reverse so newest first
	for i, j := 0, len(summaries)-1; i < j; i, j = i+1, j-1 {
		summaries[i], summaries[j] = summaries[j], summaries[i]
	}
	if summaries == nil {
		summaries = []MailSummary{}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"messages": summaries,
		"mailbox":  address,
		"total":    mbox.Messages,
	})
}

// GetMessage fetches the full body of a message by UID.
func (h *IMAPHandler) GetMessage(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var uid uint32
	if _, err := fmt.Sscan(c.Param("uid"), &uid); err != nil || uid == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid uid")
	}

	folder := c.QueryParam("folder")
	if folder == "" {
		folder = "INBOX"
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	if _, err = ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	section := &imap.BodySectionName{}
	items := []imap.FetchItem{imap.FetchUid, imap.FetchFlags, imap.FetchEnvelope, section.FetchItem()}

	ch := make(chan *imap.Message, 1)
	done := make(chan error, 1)
	go func() { done <- ic.UidFetch(seqset, items, ch) }()

	var detail MailDetail
	for msg := range ch {
		if msg.Envelope != nil {
			unread := true
			for _, f := range msg.Flags {
				if f == imap.SeenFlag {
					unread = false
					break
				}
			}
			date := ""
			if !msg.Envelope.Date.IsZero() {
				date = msg.Envelope.Date.Format(time.RFC3339)
			}
			detail = MailDetail{
				UID:     msg.Uid,
				Subject: msg.Envelope.Subject,
				From:    formatAddr(msg.Envelope.From),
				To:      formatAddr(msg.Envelope.To),
				Cc:      formatAddr(msg.Envelope.Cc),
				Date:    date,
				Unread:  unread,
			}
			if r := msg.GetBody(section); r != nil {
				detail.Body = extractIMAPBody(r)
			}
		}
	}
	if err := <-done; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "fetch failed: "+err.Error())
	}

	// Mark as read
	markSet := new(imap.SeqSet)
	markSet.AddNum(uid)
	ic.UidStore(markSet, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.SeenFlag}, nil)

	return c.JSON(http.StatusOK, detail)
}

// SendMessage sends a new message or reply from the user's role mailbox.
func (h *IMAPHandler) SendMessage(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var req struct {
		To      string `json:"to"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.Bind(&req); err != nil || req.To == "" || req.Subject == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "to and subject are required")
	}

	msg := gomail.NewMessage()
	msg.SetHeader("From", address)
	msg.SetHeader("To", req.To)
	msg.SetHeader("Subject", req.Subject)
	msg.SetBody("text/plain", req.Body)

	d := gomail.NewDialer(host, 587, address, password)
	d.TLSConfig = &tls.Config{ServerName: host}
	d.Timeout = 15 * time.Second

	type result struct{ err error }
	ch := make(chan result, 1)
	go func() { ch <- result{d.DialAndSend(msg)} }()
	select {
	case r := <-ch:
		if r.err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "send failed: "+r.err.Error())
		}
	case <-time.After(20 * time.Second):
		return echo.NewHTTPError(http.StatusGatewayTimeout, "SMTP timed out")
	}

	return c.JSON(http.StatusOK, map[string]string{"status": "sent"})
}

// MarkRead adds the \Seen flag to a message by UID.
func (h *IMAPHandler) MarkRead(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var uid uint32
	if _, err := fmt.Sscan(c.Param("uid"), &uid); err != nil || uid == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid uid")
	}

	folder := c.QueryParam("folder")
	if folder == "" {
		folder = "INBOX"
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	if _, err = ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)
	ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.SeenFlag}, nil)

	return c.NoContent(http.StatusNoContent)
}

// DeleteMessage moves a message to Trash by UID.
func (h *IMAPHandler) DeleteMessage(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var uid uint32
	if _, err := fmt.Sscan(c.Param("uid"), &uid); err != nil || uid == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid uid")
	}

	folder := c.QueryParam("folder")
	if folder == "" {
		folder = "INBOX"
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	if _, err = ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	// Try to copy to Trash first; if Trash doesn't exist, just delete in place
	if err = ic.UidCopy(seqset, "Trash"); err != nil {
		ic.UidCopy(seqset, "INBOX.Trash") // some servers use this name
	}

	ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
	ic.Expunge(nil)

	return c.NoContent(http.StatusNoContent)
}
