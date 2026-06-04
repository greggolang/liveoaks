package handlers

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	imapclient "github.com/emersion/go-imap/client"
	"github.com/labstack/echo/v4"
)

// mailboxCreds looks up the IMAP address, password and server host for a mail
// account so the app can log into that mailbox on the holder's behalf (used by
// the importer and the empty-mailbox tool). The returned error carries a
// user-facing message suitable for a 400 response.
func (h *MailHandler) mailboxCreds(ctx context.Context, id string) (address, password, host string, err error) {
	if e := h.DB.QueryRow(ctx, `
		SELECT address, imap_password FROM mail_accounts WHERE id = $1 AND active = true
	`, id).Scan(&address, &password); e != nil || address == "" {
		return "", "", "", fmt.Errorf("mail account not found")
	}
	if password == "" {
		return "", "", "", fmt.Errorf("this mailbox has no password yet — click Reset Password first so the app can log in")
	}
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'imap_host'`).Scan(&host)
	if host == "" {
		host = "mail.dropshot.company"
	}
	return address, password, host, nil
}

// autoFolder is the sentinel folder value that turns on Gmail-label routing:
// each message is filed by its X-Gmail-Labels header instead of all going to
// one folder.
const autoFolder = "__auto__"

// ImportMbox imports every message from an uploaded MBOX file into a mail
// account's mailbox via IMAP APPEND. It exists so archived Google Workspace
// mail can be preserved in the board mailboxes before the Workspace accounts
// are cancelled.
//
// The target account must already have a mailbox password set (Reset Password)
// because the importer logs into the mailbox over IMAP exactly like the holder
// would.
//
// When the chosen folder is autoFolder, each message is routed by its Gmail
// label (Sent → Sent, Inbox → Inbox, archived → Archive, Draft/Trash/Spam →
// their folders), faithfully rebuilding the original mailbox layout from the
// single Takeout file. Otherwise every message lands in the one chosen folder.
func (h *MailHandler) ImportMbox(c echo.Context) error {
	address, password, host, err := h.mailboxCreds(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	folder := c.FormValue("folder")
	if folder == "" {
		folder = autoFolder
	}
	autoSort := folder == autoFolder

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "no MBOX file uploaded")
	}
	f, err := fileHeader.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not read uploaded file")
	}
	defer f.Close()

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	router := newFolderRouter(ic)
	single := ""
	if !autoSort {
		single = router.resolve(folder)
	}

	imported, failed := 0, 0
	byFolder := map[string]int{}
	parseErr := splitMbox(f, func(raw []byte, fromLine string) {
		target := single
		flags := []string{imap.SeenFlag}
		date := time.Time{}

		if m, err := mail.ReadMessage(bytes.NewReader(raw)); err == nil {
			if d, err := m.Header.Date(); err == nil {
				date = d
			}
			if autoSort {
				logical, fl := routeByLabels(m.Header.Get("X-Gmail-Labels"))
				target = router.resolve(logical)
				flags = fl
			}
		} else if autoSort {
			target = router.resolve("Archive")
		}
		if date.IsZero() {
			date = parseFromLineDate(fromLine)
		}
		if target == "" {
			target = "INBOX"
		}

		buf := bytes.NewBuffer(toCRLF(raw))
		if appendErr := ic.Append(target, flags, date, buf); appendErr != nil {
			failed++
		} else {
			imported++
			byFolder[target]++
		}
	})
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to read MBOX file: "+parseErr.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"imported":  imported,
		"failed":    failed,
		"mailbox":   address,
		"by_folder": byFolder,
	})
}

// EmptyMailbox permanently deletes every message in every folder of a mail
// account's mailbox over IMAP. It's the reset used before re-running an import
// (the importer doesn't dedupe, so re-importing into a non-empty mailbox would
// create duplicates). The account record, password and folders are kept — only
// the messages are expunged.
func (h *MailHandler) EmptyMailbox(c echo.Context) error {
	address, password, host, err := h.mailboxCreds(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	// Collect every selectable mailbox first; \Noselect entries are containers,
	// not real folders, and can't be opened.
	listCh := make(chan *imap.MailboxInfo, 32)
	listDone := make(chan error, 1)
	go func() { listDone <- ic.List("", "*", listCh) }()
	var folders []string
	for mb := range listCh {
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
	if err := <-listDone; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list folders: "+err.Error())
	}

	deleted := 0
	for _, folder := range folders {
		mbox, err := ic.Select(folder, false)
		if err != nil || mbox.Messages == 0 {
			continue
		}
		seqset := new(imap.SeqSet)
		seqset.AddRange(1, mbox.Messages)
		if err := ic.Store(seqset, imap.FormatFlagsOp(imap.AddFlags, true),
			[]interface{}{imap.DeletedFlag}, nil); err != nil {
			continue
		}
		if err := ic.Expunge(nil); err != nil {
			continue
		}
		deleted += int(mbox.Messages)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"deleted": deleted,
		"mailbox": address,
	})
}

// MailboxStats returns how many messages a mail account holds, in total and
// per folder, using a cheap IMAP STATUS query per folder (no message fetch).
// It's loaded lazily per card on the admin Mail page so admins can see how full
// each board mailbox is — e.g. before cancelling a Google Workspace account.
func (h *MailHandler) MailboxStats(c echo.Context) error {
	address, password, host, err := h.mailboxCreds(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}
	defer ic.Logout()

	listCh := make(chan *imap.MailboxInfo, 32)
	listDone := make(chan error, 1)
	go func() { listDone <- ic.List("", "*", listCh) }()
	var folders []string
	for mb := range listCh {
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
	if err := <-listDone; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list folders: "+err.Error())
	}

	total, unseen := 0, 0
	byFolder := map[string]int{}
	for _, folder := range folders {
		status, err := ic.Status(folder, []imap.StatusItem{imap.StatusMessages, imap.StatusUnseen})
		if err != nil {
			continue
		}
		byFolder[folder] = int(status.Messages)
		total += int(status.Messages)
		unseen += int(status.Unseen)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"messages":  total,
		"unseen":    unseen,
		"by_folder": byFolder,
	})
}

// routeByLabels maps a Gmail X-Gmail-Labels header value to a target folder and
// the IMAP flags to store with the message. Routing is by the system labels
// Takeout writes; user labels are ignored. Archived mail (no Inbox label) falls
// through to Archive, which also catches non-Gmail files that have no labels.
func routeByLabels(labels string) (folder string, flags []string) {
	has := func(name string) bool {
		for _, l := range strings.Split(labels, ",") {
			if strings.EqualFold(strings.Trim(strings.TrimSpace(l), `"`), name) {
				return true
			}
		}
		return false
	}

	seen := []string{imap.SeenFlag}
	if has("Unread") {
		seen = []string{}
	}

	switch {
	case has("Trash"):
		return "Trash", seen
	case has("Spam"):
		return "Junk", seen
	case has("Draft"):
		return "Drafts", []string{imap.DraftFlag}
	case has("Sent"):
		return "Sent", seen
	case has("Inbox"):
		return "INBOX", seen
	default:
		return "Archive", seen
	}
}

// folderRouter resolves logical folder names to the server's actual mailbox
// names once each, creating non-INBOX folders that don't exist yet so APPEND
// can't fail on a missing mailbox.
type folderRouter struct {
	ic    *imapclient.Client
	cache map[string]string
}

func newFolderRouter(ic *imapclient.Client) *folderRouter {
	return &folderRouter{ic: ic, cache: map[string]string{}}
}

func (r *folderRouter) resolve(logical string) string {
	if actual, ok := r.cache[logical]; ok {
		return actual
	}
	actual := resolveFolder(r.ic, logical)
	if !strings.EqualFold(actual, "INBOX") {
		// Best-effort: Create errors when the mailbox already exists, which is fine.
		r.ic.Create(actual)
	}
	r.cache[logical] = actual
	return actual
}

// splitMbox streams an mbox file and calls fn once per message with the raw
// RFC 822 bytes and the mbox "From " separator line. A message boundary is a
// line beginning with "From " that follows a blank line (or the start of the
// file) — the convention Gmail / Google Takeout exports use. Requiring the
// preceding blank line avoids splitting on a body line that starts with "From ".
func splitMbox(r io.Reader, fn func(raw []byte, fromLine string)) error {
	br := bufio.NewReaderSize(r, 64*1024)
	var cur bytes.Buffer
	var fromLine string
	prevBlank := true // start-of-file counts as "after a blank line"

	flush := func() {
		if cur.Len() == 0 {
			return
		}
		trimmed := bytes.TrimRight(cur.Bytes(), "\r\n")
		msg := make([]byte, len(trimmed)) // copy: cur is reused for the next message
		copy(msg, trimmed)
		if len(msg) > 0 {
			fn(msg, fromLine)
		}
		cur.Reset()
	}

	for {
		line, err := br.ReadBytes('\n')
		if len(line) > 0 {
			if prevBlank && bytes.HasPrefix(line, []byte("From ")) {
				flush()
				fromLine = string(bytes.TrimRight(line, "\r\n"))
			} else {
				cur.Write(line)
			}
			prevBlank = len(bytes.TrimRight(line, "\r\n")) == 0
		}
		if err == io.EOF {
			flush()
			return nil
		}
		if err != nil {
			return err
		}
	}
}

// parseFromLineDate extracts the date from an mbox "From " separator line, used
// as a fallback when the message has no parseable Date header. The line looks
// like "From sender@host  Mon Jan  2 15:04:05 2006"; the date is everything
// after the envelope sender.
func parseFromLineDate(fromLine string) time.Time {
	if fields := strings.SplitN(fromLine, " ", 3); len(fields) == 3 {
		ds := strings.TrimSpace(fields[2])
		for _, layout := range []string{
			"Mon Jan _2 15:04:05 2006",
			"Mon Jan _2 15:04:05 MST 2006",
			"Mon Jan _2 15:04:05 -0700 2006",
			"Mon Jan 02 15:04:05 2006",
		} {
			if t, err := time.Parse(layout, ds); err == nil {
				return t
			}
		}
	}
	return time.Now()
}

// toCRLF normalises line endings to CRLF, which is what IMAP APPEND expects.
// It collapses any existing CRLF first so already-correct files aren't doubled.
func toCRLF(b []byte) []byte {
	b = bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n"))
	return bytes.ReplaceAll(b, []byte("\n"), []byte("\r\n"))
}
