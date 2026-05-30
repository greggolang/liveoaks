package handlers

import (
	"context"
	"encoding/base64"
	"fmt"
	"html"
	"net/http"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"
)

// roleEmailKey maps a portal role to the settings table key that holds its email address.
var roleEmailKey = map[string]string{
	"president":      "google_email_president",
	"vice_president": "google_email_vice_president",
	"secretary":      "google_email_secretary",
	"treasurer":      "google_email_treasurer",
	"billing":        "google_email_billing",
	"entertainment":  "google_email_entertainment",
	"house_grounds":  "google_email_house_grounds",
	"usta":           "google_email_usta",
	"admin":          "google_email_admin",
}

type GoogleHandler struct {
	DB             *pgxpool.Pool
	ServiceAccount []byte // GOOGLE_SA_JSON env var contents
}

// ─── helpers ────────────────────────────────────────────────────────────────

func (h *GoogleHandler) roleEmail(ctx context.Context, role string) (string, error) {
	key, ok := roleEmailKey[role]
	if !ok {
		return "", fmt.Errorf("no mailbox is associated with the %q role", role)
	}
	var addr string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = $1`, key).Scan(&addr)
	if addr == "" {
		return "", fmt.Errorf("mailbox not configured for the %q role — ask an administrator to set it up in Admin → Settings", role)
	}
	return addr, nil
}

func (h *GoogleHandler) configured() bool { return len(h.ServiceAccount) > 0 }

func (h *GoogleHandler) gmailSvc(ctx context.Context, subject string) (*gmail.Service, error) {
	if !h.configured() {
		return nil, fmt.Errorf("Google integration is not configured (GOOGLE_SA_JSON missing)")
	}
	cfg, err := google.JWTConfigFromJSON(h.ServiceAccount,
		"https://www.googleapis.com/auth/gmail.modify",
		"https://www.googleapis.com/auth/gmail.send",
	)
	if err != nil {
		return nil, fmt.Errorf("invalid service account: %w", err)
	}
	cfg.Subject = subject
	return gmail.NewService(ctx, option.WithHTTPClient(cfg.Client(ctx)))
}

func (h *GoogleHandler) driveSvc(ctx context.Context, subject string) (*drive.Service, error) {
	if !h.configured() {
		return nil, fmt.Errorf("Google integration is not configured (GOOGLE_SA_JSON missing)")
	}
	cfg, err := google.JWTConfigFromJSON(h.ServiceAccount,
		"https://www.googleapis.com/auth/drive.readonly",
	)
	if err != nil {
		return nil, fmt.Errorf("invalid service account: %w", err)
	}
	cfg.Subject = subject
	return drive.NewService(ctx, option.WithHTTPClient(cfg.Client(ctx)))
}

// extractBody recursively walks a Gmail message part tree and returns the best
// available HTML body, falling back to plain text wrapped in <pre>.
func extractBody(part *gmail.MessagePart) string {
	if part == nil {
		return ""
	}
	// Leaf node with data
	if len(part.Parts) == 0 {
		if part.Body == nil || part.Body.Data == "" {
			return ""
		}
		raw, err := base64.URLEncoding.DecodeString(part.Body.Data)
		if err != nil {
			return ""
		}
		if part.MimeType == "text/html" {
			return string(raw)
		}
		if part.MimeType == "text/plain" {
			return "<pre style='white-space:pre-wrap;font-family:inherit'>" +
				html.EscapeString(string(raw)) + "</pre>"
		}
		return ""
	}
	// Prefer HTML parts; collect all, return first HTML found, else first plain
	var htmlBody, plainBody string
	for _, p := range part.Parts {
		body := extractBody(p)
		if body == "" {
			continue
		}
		if strings.Contains(p.MimeType, "html") || strings.HasPrefix(body, "<") {
			if htmlBody == "" {
				htmlBody = body
			}
		} else if plainBody == "" {
			plainBody = body
		}
	}
	if htmlBody != "" {
		return htmlBody
	}
	return plainBody
}

func headerVal(headers []*gmail.MessagePartHeader, name string) string {
	for _, h := range headers {
		if strings.EqualFold(h.Name, name) {
			return h.Value
		}
	}
	return ""
}

func hasLabel(labels []string, label string) bool {
	for _, l := range labels {
		if l == label {
			return true
		}
	}
	return false
}

// ─── response types ──────────────────────────────────────────────────────────

type ThreadSummary struct {
	ID           string `json:"id"`
	Subject      string `json:"subject"`
	From         string `json:"from"`
	Snippet      string `json:"snippet"`
	Date         string `json:"date"`
	Unread       bool   `json:"unread"`
	MessageCount int    `json:"message_count"`
}

type MessageDetail struct {
	ID      string `json:"id"`
	From    string `json:"from"`
	To      string `json:"to"`
	Cc      string `json:"cc,omitempty"`
	Subject string `json:"subject"`
	Date    string `json:"date"`
	Body    string `json:"body"`
	Unread  bool   `json:"unread"`
}

type ThreadDetail struct {
	ID       string          `json:"id"`
	Subject  string          `json:"subject"`
	Messages []MessageDetail `json:"messages"`
}

type DriveFileItem struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MimeType     string `json:"mime_type"`
	ModifiedTime string `json:"modified_time"`
	Size         int64  `json:"size,omitempty"`
	WebViewLink  string `json:"web_view_link,omitempty"`
	IconLink     string `json:"icon_link,omitempty"`
	IsFolder     bool   `json:"is_folder"`
}

// ─── Gmail endpoints ─────────────────────────────────────────────────────────

// ListThreads returns the inbox thread list for the caller's role mailbox.
// Query params: label (default INBOX), q (search), pageToken
func (h *GoogleHandler) ListThreads(c echo.Context) error {
	ctx := c.Request().Context()
	role := c.Get("role").(string)

	addr, err := h.roleEmail(ctx, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	svc, err := h.gmailSvc(ctx, addr)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	label := c.QueryParam("label")
	if label == "" {
		label = "INBOX"
	}

	listCall := svc.Users.Threads.List("me").MaxResults(25).LabelIds(label)
	if q := c.QueryParam("q"); q != "" {
		listCall = listCall.Q(q)
	}
	if pt := c.QueryParam("pageToken"); pt != "" {
		listCall = listCall.PageToken(pt)
	}

	resp, err := listCall.Do()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list threads: "+err.Error())
	}

	summaries := make([]ThreadSummary, len(resp.Threads))
	var wg sync.WaitGroup
	for i, t := range resp.Threads {
		wg.Add(1)
		go func(idx int, threadID, snippet string) {
			defer wg.Done()
			thread, err := svc.Users.Threads.Get("me", threadID).
				Format("METADATA").
				MetadataHeaders("Subject", "From", "Date").
				Do()
			if err != nil {
				summaries[idx] = ThreadSummary{ID: threadID, Snippet: snippet}
				return
			}
			var subject, from, date string
			unread := false
			for _, msg := range thread.Messages {
				hdrs := msg.Payload.Headers
				if subject == "" {
					subject = headerVal(hdrs, "Subject")
				}
				from = headerVal(hdrs, "From")
				date = headerVal(hdrs, "Date")
				if hasLabel(msg.LabelIds, "UNREAD") {
					unread = true
				}
			}
			summaries[idx] = ThreadSummary{
				ID:           threadID,
				Subject:      subject,
				From:         from,
				Snippet:      snippet,
				Date:         date,
				Unread:       unread,
				MessageCount: len(thread.Messages),
			}
		}(i, t.Id, t.Snippet)
	}
	wg.Wait()

	return c.JSON(http.StatusOK, map[string]interface{}{
		"threads":        summaries,
		"next_page_token": resp.NextPageToken,
		"mailbox":        addr,
	})
}

// GetThread returns the full thread with all message bodies.
func (h *GoogleHandler) GetThread(c echo.Context) error {
	ctx := c.Request().Context()
	role := c.Get("role").(string)

	addr, err := h.roleEmail(ctx, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	svc, err := h.gmailSvc(ctx, addr)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	thread, err := svc.Users.Threads.Get("me", c.Param("threadId")).Format("FULL").Do()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch thread")
	}

	var subject string
	messages := make([]MessageDetail, 0, len(thread.Messages))
	for _, msg := range thread.Messages {
		hdrs := msg.Payload.Headers
		msgSubject := headerVal(hdrs, "Subject")
		if subject == "" {
			subject = msgSubject
		}
		messages = append(messages, MessageDetail{
			ID:      msg.Id,
			From:    headerVal(hdrs, "From"),
			To:      headerVal(hdrs, "To"),
			Cc:      headerVal(hdrs, "Cc"),
			Subject: msgSubject,
			Date:    headerVal(hdrs, "Date"),
			Body:    extractBody(msg.Payload),
			Unread:  hasLabel(msg.LabelIds, "UNREAD"),
		})
	}

	return c.JSON(http.StatusOK, ThreadDetail{ID: thread.Id, Subject: subject, Messages: messages})
}

// SendEmail sends a new message or reply from the role's mailbox.
func (h *GoogleHandler) SendEmail(c echo.Context) error {
	ctx := c.Request().Context()
	role := c.Get("role").(string)

	var req struct {
		To               string `json:"to"`
		Subject          string `json:"subject"`
		Body             string `json:"body"`
		ThreadID         string `json:"thread_id"`
		ReplyToMessageID string `json:"reply_to_message_id"`
	}
	if err := c.Bind(&req); err != nil || req.To == "" || req.Subject == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "to and subject are required")
	}

	fromAddr, err := h.roleEmail(ctx, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	svc, err := h.gmailSvc(ctx, fromAddr)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	var raw strings.Builder
	raw.WriteString("From: " + fromAddr + "\r\n")
	raw.WriteString("To: " + req.To + "\r\n")
	raw.WriteString("Subject: " + req.Subject + "\r\n")
	if req.ReplyToMessageID != "" {
		raw.WriteString("In-Reply-To: " + req.ReplyToMessageID + "\r\n")
		raw.WriteString("References: " + req.ReplyToMessageID + "\r\n")
	}
	raw.WriteString("MIME-Version: 1.0\r\n")
	raw.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	raw.WriteString(req.Body)

	msg := &gmail.Message{Raw: base64.URLEncoding.EncodeToString([]byte(raw.String()))}
	if req.ThreadID != "" {
		msg.ThreadId = req.ThreadID
	}

	sent, err := svc.Users.Messages.Send("me", msg).Do()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not send email: "+err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"id": sent.Id, "thread_id": sent.ThreadId})
}

// MarkRead removes the UNREAD label from every message in a thread.
func (h *GoogleHandler) MarkRead(c echo.Context) error {
	ctx := c.Request().Context()
	role := c.Get("role").(string)

	addr, err := h.roleEmail(ctx, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	svc, err := h.gmailSvc(ctx, addr)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	thread, err := svc.Users.Threads.Get("me", c.Param("threadId")).Format("MINIMAL").Do()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch thread")
	}
	for _, msg := range thread.Messages {
		if hasLabel(msg.LabelIds, "UNREAD") {
			svc.Users.Messages.Modify("me", msg.Id, &gmail.ModifyMessageRequest{
				RemoveLabelIds: []string{"UNREAD"},
			}).Do()
		}
	}
	return c.NoContent(http.StatusNoContent)
}

// TrashThread moves a thread to Trash.
func (h *GoogleHandler) TrashThread(c echo.Context) error {
	ctx := c.Request().Context()
	role := c.Get("role").(string)

	addr, err := h.roleEmail(ctx, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	svc, err := h.gmailSvc(ctx, addr)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	if _, err = svc.Users.Threads.Trash("me", c.Param("threadId")).Do(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not trash thread")
	}
	return c.NoContent(http.StatusNoContent)
}

// ─── Drive endpoints ─────────────────────────────────────────────────────────

// ListDriveFiles lists files in a folder (defaults to root).
// Query params: folderId, pageToken
func (h *GoogleHandler) ListDriveFiles(c echo.Context) error {
	ctx := c.Request().Context()
	role := c.Get("role").(string)

	addr, err := h.roleEmail(ctx, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	svc, err := h.driveSvc(ctx, addr)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	folderID := c.QueryParam("folderId")
	if folderID == "" {
		folderID = "root"
	}

	call := svc.Files.List().
		Q(fmt.Sprintf("'%s' in parents and trashed = false", folderID)).
		Fields("nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,shortcutDetails)").
		OrderBy("folder,name").
		PageSize(100)
	if pt := c.QueryParam("pageToken"); pt != "" {
		call = call.PageToken(pt)
	}

	resp, err := call.Do()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list Drive files: "+err.Error())
	}

	files := make([]DriveFileItem, 0, len(resp.Files))
	for _, f := range resp.Files {
		files = append(files, DriveFileItem{
			ID:           f.Id,
			Name:         f.Name,
			MimeType:     f.MimeType,
			ModifiedTime: f.ModifiedTime,
			Size:         f.Size,
			WebViewLink:  f.WebViewLink,
			IconLink:     f.IconLink,
			IsFolder:     f.MimeType == "application/vnd.google-apps.folder",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"files":          files,
		"next_page_token": resp.NextPageToken,
		"mailbox":        addr,
	})
}
