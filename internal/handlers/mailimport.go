package handlers

import (
	"bufio"
	"bytes"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	"github.com/labstack/echo/v4"
)

// ImportMbox imports every message from an uploaded MBOX file into a mail
// account's mailbox via IMAP APPEND. It exists so archived Google Workspace
// mail can be preserved in the board mailboxes before the Workspace accounts
// are cancelled.
//
// The target account must already have a mailbox password set (Reset Password)
// because the importer logs into the mailbox over IMAP exactly like the holder
// would. Imported messages are flagged \Seen — they're an archive, not new mail.
func (h *MailHandler) ImportMbox(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	var address, password string
	if err := h.DB.QueryRow(ctx, `
		SELECT address, imap_password FROM mail_accounts WHERE id = $1 AND active = true
	`, id).Scan(&address, &password); err != nil || address == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "mail account not found")
	}
	if password == "" {
		return echo.NewHTTPError(http.StatusBadRequest,
			"this mailbox has no password yet — click Reset Password first so the importer can log in")
	}

	var host string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'imap_host'`).Scan(&host)
	if host == "" {
		host = "mail.webgoserver.com"
	}

	folder := c.FormValue("folder")
	if folder == "" {
		folder = "INBOX"
	}

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

	folder = resolveFolder(ic, folder)

	imported, failed := 0, 0
	parseErr := splitMbox(f, func(raw []byte, internalDate time.Time) {
		buf := bytes.NewBuffer(toCRLF(raw))
		if appendErr := ic.Append(folder, []string{imap.SeenFlag}, internalDate, buf); appendErr != nil {
			failed++
		} else {
			imported++
		}
	})
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to read MBOX file: "+parseErr.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"imported": imported,
		"failed":   failed,
		"mailbox":  address,
		"folder":   folder,
	})
}

// splitMbox streams an mbox file and calls fn once per message with the raw
// RFC 822 bytes and the message's internal date. A message boundary is a line
// beginning with "From " that follows a blank line (or the start of the file) —
// the convention Gmail / Google Takeout exports use. Requiring the preceding
// blank line avoids splitting on a body line that merely starts with "From ".
func splitMbox(r io.Reader, fn func(raw []byte, date time.Time)) error {
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
			fn(msg, mboxDate(msg, fromLine))
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

// mboxDate determines a message's internal date: the Date header if present and
// parseable, otherwise the date on the mbox "From " separator line, otherwise now.
func mboxDate(msg []byte, fromLine string) time.Time {
	if m, err := mail.ReadMessage(bytes.NewReader(msg)); err == nil {
		if d, err := m.Header.Date(); err == nil {
			return d
		}
	}
	// "From sender@host  Mon Jan  2 15:04:05 2006" — the date is everything after
	// the envelope sender (the second space-separated field onward).
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
