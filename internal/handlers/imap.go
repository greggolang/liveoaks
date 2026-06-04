package handlers

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"html"
	"io"
	"net/http"
	"path/filepath"
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
	DB        *pgxpool.Pool
	UploadDir string // base dir for system document attachments (e.g. /opt/liveoaks/uploads)
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
		host = "mail.dropshot.company"
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
	// TLS config uses the configured hostname for certificate verification regardless
	// of which address we actually connect to.
	tlsCfg := &tls.Config{ServerName: host}

	// Try each candidate in order: external hostname, then localhost (handles the
	// case where the mail server is co-hosted and hairpin NAT breaks the external IP).
	candidates := []string{host + ":993", "localhost:993"}
	var c *imapclient.Client
	var err error
	for _, addr := range candidates {
		c, err = imapclient.DialTLS(addr, tlsCfg)
		if err == nil {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("cannot connect to mail server at %s: %w", host, err)
	}
	if err = c.Login(address, password); err != nil {
		c.Logout()
		return nil, fmt.Errorf("IMAP login failed — check credentials in Admin → Mail")
	}
	return c, nil
}

// smtpSend delivers msg via port 587, falling back to localhost when the
// external hostname fails (hairpin NAT — app and mail server on same host).
func smtpSend(host, address, password string, msg *gomail.Message) error {
	tlsCfg := &tls.Config{ServerName: host}
	var lastErr error
	for _, smtpHost := range []string{host, "localhost"} {
		d := gomail.NewDialer(smtpHost, 587, address, password)
		d.TLSConfig = tlsCfg
		d.Timeout = 15 * time.Second
		if lastErr = d.DialAndSend(msg); lastErr == nil {
			return nil
		}
	}
	return lastErr
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

// resolveFolder maps a logical folder name to the actual IMAP folder name on
// this server by listing all mailboxes and matching against common variants.
// If no match is found it returns the original name unchanged (let Select fail).
func resolveFolder(ic *imapclient.Client, want string) string {
	aliases := map[string][]string{
		"Sent":    {"Sent", "Sent Items", "INBOX.Sent", "Sent Messages"},
		"Trash":   {"Trash", "INBOX.Trash", "Deleted Items", "Deleted Messages", "Junk"},
		"Drafts":  {"Drafts", "Draft", "INBOX.Drafts"},
		"Junk":    {"Junk", "Spam", "Junk E-mail", "INBOX.Junk"},
		"Archive": {"Archive", "Archives", "All Mail", "INBOX.Archive"},
	}
	variants, known := aliases[want]
	if !known {
		return want
	}

	ch := make(chan *imap.MailboxInfo, 32)
	done := make(chan error, 1)
	go func() { done <- ic.List("", "*", ch) }()

	found := make(map[string]bool)
	for mb := range ch {
		found[mb.Name] = true
	}
	<-done

	for _, v := range variants {
		if found[v] {
			return v
		}
	}
	return want
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

	folder = resolveFolder(ic, folder)
	mbox, err := ic.Select(folder, true)
	if err != nil {
		// A folder that doesn't exist yet (e.g. Archive/Drafts on a mailbox that
		// has never received any) is simply empty, not an error — let the tab
		// render blank instead of surfacing a failure.
		return c.JSON(http.StatusOK, map[string]interface{}{
			"messages": []MailSummary{},
			"mailbox":  address,
			"total":    0,
		})
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

	folder = resolveFolder(ic, folder)
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

// SendMessage sends a new message from the user's role mailbox.
// Accepts multipart/form-data: to, subject, body, cc (text fields),
// attachments[] (uploaded files), doc_ids[] (system document IDs to attach).
func (h *IMAPHandler) SendMessage(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	to := c.FormValue("to")
	subject := c.FormValue("subject")
	body := c.FormValue("body")
	cc := c.FormValue("cc")

	if to == "" || subject == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "to and subject are required")
	}

	ctx := c.Request().Context()

	// Look up the sender's personal name and their board role label so the
	// recipient sees a friendly From like "Greg Howard, Treasurer <treasurer@…>"
	// instead of a bare mailbox address.
	userID := c.Get("user_id").(string)
	var senderName, roleLabel string
	h.DB.QueryRow(ctx, `
		SELECT COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), ''),
		       COALESCE(ma.role_label, '')
		FROM mail_accounts ma
		LEFT JOIN users u ON u.id = ma.assigned_user_id
		WHERE ma.assigned_user_id = $1 AND ma.active = true
		ORDER BY ma.created_at LIMIT 1`, userID).Scan(&senderName, &roleLabel)

	fromName := senderName
	if roleLabel != "" {
		if fromName != "" {
			fromName = senderName + ", " + roleLabel
		} else {
			fromName = roleLabel
		}
	}

	msg := gomail.NewMessage()
	// SetAddressHeader encodes the display name correctly; an empty fromName
	// falls back to just the address.
	msg.SetAddressHeader("From", address, fromName)
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	if cc != "" {
		msg.SetHeader("Cc", cc)
	}
	msg.SetBody("text/plain", body)

	// Attach uploaded local files
	form, _ := c.MultipartForm()
	if form != nil {
		for _, fh := range form.File["attachments"] {
			fh := fh
			msg.Attach(fh.Filename, gomail.SetCopyFunc(func(w io.Writer) error {
				f, err := fh.Open()
				if err != nil {
					return err
				}
				defer f.Close()
				_, err = io.Copy(w, f)
				return err
			}))
		}
		// Attach system documents by ID
		for _, docID := range form.Value["doc_ids[]"] {
			var filename, origName string
			if err := h.DB.QueryRow(ctx,
				`SELECT filename, original_name FROM documents WHERE id = $1`, docID,
			).Scan(&filename, &origName); err != nil {
				continue
			}
			path := filepath.Join(h.UploadDir, "documents", filename)
			msg.Attach(path, gomail.Rename(origName))
		}
	}

	if err := smtpSend(host, address, password, msg); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "send failed: "+err.Error())
	}

	// Save a copy to the Sent folder via IMAP so it appears in the Sent tab.
	// Best-effort: the message has already been delivered, so an append failure
	// must not turn a successful send into an error.
	h.saveToSent(host, address, password, msg)

	return c.JSON(http.StatusOK, map[string]string{"status": "sent"})
}

// saveToSent appends a copy of a just-sent message to the user's Sent folder.
// Without this, SMTP delivers the mail but nothing ever lands in the IMAP Sent
// mailbox, so the Sent tab always looks empty.
func (h *IMAPHandler) saveToSent(host, address, password string, msg *gomail.Message) {
	var buf bytes.Buffer
	if _, err := msg.WriteTo(&buf); err != nil {
		return
	}
	ic, err := imapConnect(host, address, password)
	if err != nil {
		return
	}
	defer ic.Logout()
	sent := resolveFolder(ic, "Sent")
	_ = ic.Append(sent, []string{imap.SeenFlag}, time.Now(), &buf)
}

// MarkUnread removes the \Seen flag from a message by UID.
func (h *IMAPHandler) MarkUnread(c echo.Context) error {
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

	folder = resolveFolder(ic, folder)
	if _, err = ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)
	ic.UidStore(seqset, imap.FormatFlagsOp(imap.RemoveFlags, true), []interface{}{imap.SeenFlag}, nil)

	return c.NoContent(http.StatusNoContent)
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

	folder = resolveFolder(ic, folder)
	if _, err = ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)
	ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.SeenFlag}, nil)

	return c.NoContent(http.StatusNoContent)
}

// systemFolder reports whether a name is one of the built-in mailboxes, which
// must not be created as duplicates or deleted as if they were custom folders.
func systemFolder(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "inbox", "sent", "sent items", "drafts", "draft", "trash",
		"deleted items", "junk", "spam", "archive", "archives", "all mail":
		return true
	}
	return false
}

// ListFolders returns every selectable mailbox folder for the user's account,
// so the mail page can show custom folders alongside the built-in ones.
func (h *IMAPHandler) ListFolders(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	ch := make(chan *imap.MailboxInfo, 32)
	done := make(chan error, 1)
	go func() { done <- ic.List("", "*", ch) }()
	folders := []string{}
	for mb := range ch {
		selectable := true
		for _, attr := range mb.Attributes {
			if attr == imap.NoSelectAttr {
				selectable = false
				break
			}
		}
		if selectable {
			folders = append(folders, mb.Name)
		}
	}
	if err := <-done; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list folders: "+err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"folders": folders})
}

// CreateFolder makes a new custom mailbox folder.
func (h *IMAPHandler) CreateFolder(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "folder name required")
	}
	if len(name) > 100 {
		return echo.NewHTTPError(http.StatusBadRequest, "folder name too long")
	}
	if strings.ContainsAny(name, "/\\\"") {
		return echo.NewHTTPError(http.StatusBadRequest, "folder name can't contain / \\ or \"")
	}
	if systemFolder(name) {
		return echo.NewHTTPError(http.StatusBadRequest, "that name is reserved")
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	if err := ic.Create(name); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not create folder — it may already exist")
	}
	ic.Subscribe(name) // best-effort, so subscription-aware clients show it

	return c.JSON(http.StatusOK, map[string]string{"name": name})
}

// DeleteFolder removes a custom folder (and its messages). Built-in folders
// are protected.
func (h *IMAPHandler) DeleteFolder(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	name := c.Param("folder")
	if name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "folder required")
	}
	if systemFolder(name) {
		return echo.NewHTTPError(http.StatusBadRequest, "built-in folders can't be deleted")
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	if err := ic.Delete(name); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not delete folder: "+err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// MessageAction applies a bulk action to one or more messages by UID. It backs
// every list/viewer button on the mail page (delete, mark read/unread, move,
// mark spam, archive) for both single messages and multi-select. Doing it in
// one IMAP session keeps multi-select fast instead of one connection per UID.
func (h *IMAPHandler) MessageAction(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var req struct {
		Folder string   `json:"folder"`
		UIDs   []uint32 `json:"uids"`
		Action string   `json:"action"` // delete | read | unread | move | spam | archive
		To     string   `json:"to"`     // destination folder for action=move
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Folder == "" {
		req.Folder = "INBOX"
	}
	if len(req.UIDs) == 0 {
		return c.JSON(http.StatusOK, map[string]int{"affected": 0})
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	folder := resolveFolder(ic, req.Folder)
	if _, err := ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(req.UIDs...)

	switch req.Action {
	case "read":
		ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.SeenFlag}, nil)
	case "unread":
		ic.UidStore(seqset, imap.FormatFlagsOp(imap.RemoveFlags, true), []interface{}{imap.SeenFlag}, nil)
	case "move", "spam", "archive":
		dest := req.To
		switch req.Action {
		case "spam":
			dest = "Junk"
		case "archive":
			dest = "Archive"
		}
		if dest == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "destination folder required")
		}
		dest = resolveFolder(ic, dest)
		ic.Create(dest) // ensure the destination exists; ignores "already exists"
		if err := ic.UidCopy(seqset, dest); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "move failed: "+err.Error())
		}
		ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
		ic.Expunge(nil)
	case "delete":
		trash := resolveFolder(ic, "Trash")
		if folder != trash {
			ic.Create(trash)
			ic.UidCopy(seqset, trash)
		}
		ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
		ic.Expunge(nil)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "unknown action")
	}

	return c.JSON(http.StatusOK, map[string]int{"affected": len(req.UIDs)})
}

// EmptyFolder permanently deletes every message in a single folder — the
// "Empty Trash" / "Empty Spam" buttons. Unlike delete (which moves to Trash),
// this expunges in place.
func (h *IMAPHandler) EmptyFolder(c echo.Context) error {
	address, password, host, err := h.creds(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	want := c.Param("folder")
	if want == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "folder required")
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	folder := resolveFolder(ic, want)
	mbox, err := ic.Select(folder, false)
	if err != nil || mbox.Messages == 0 {
		return c.JSON(http.StatusOK, map[string]int{"deleted": 0})
	}

	seqset := new(imap.SeqSet)
	seqset.AddRange(1, mbox.Messages)
	ic.Store(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
	ic.Expunge(nil)

	return c.JSON(http.StatusOK, map[string]int{"deleted": int(mbox.Messages)})
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

	folder = resolveFolder(ic, folder)
	if _, err = ic.Select(folder, false); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "folder not found: "+folder)
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	// Copy to Trash before deleting — unless we're already in Trash, in which
	// case deleting means permanent removal. UidCopy is best-effort: if the
	// Trash mailbox doesn't exist we still expunge in place.
	trash := resolveFolder(ic, "Trash")
	if folder != trash {
		ic.UidCopy(seqset, trash)
	}

	ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
	ic.Expunge(nil)

	return c.NoContent(http.StatusNoContent)
}
