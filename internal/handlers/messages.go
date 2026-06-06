package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type MessagesHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
}

type MemberMessage struct {
	ID            string     `json:"id"`
	SenderID      string     `json:"sender_id"`
	SenderName    string     `json:"sender_name"`
	RecipientID   string     `json:"recipient_id"`
	RecipientName string     `json:"recipient_name"`
	Subject       string     `json:"subject"`
	Body          string     `json:"body"`
	ReplyToID     *string    `json:"reply_to_id,omitempty"`
	ReplyToSubject *string   `json:"reply_to_subject,omitempty"`
	ReplyToSenderName *string `json:"reply_to_sender_name,omitempty"`
	ReadAt        *time.Time `json:"read_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// Inbox returns messages sent to the current user (not deleted by them).
func (h *MessagesHandler) Inbox(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT m.id,
		       m.sender_id,    s.first_name || ' ' || s.last_name,
		       m.recipient_id, r.first_name || ' ' || r.last_name,
		       m.subject, m.body,
		       m.reply_to,
		       rt.subject,
		       (SELECT rs.first_name || ' ' || rs.last_name FROM users rs WHERE rs.id = rt.sender_id),
		       m.read_at, m.created_at
		FROM member_messages m
		JOIN users s ON s.id = m.sender_id
		JOIN users r ON r.id = m.recipient_id
		LEFT JOIN member_messages rt ON rt.id = m.reply_to
		WHERE m.recipient_id = $1 AND m.deleted_by_recipient = false
		ORDER BY m.created_at DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch inbox")
	}
	defer rows.Close()
	return c.JSON(http.StatusOK, scanMessages(rows))
}

// Sent returns messages sent by the current user (not deleted by them).
func (h *MessagesHandler) Sent(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT m.id,
		       m.sender_id,    s.first_name || ' ' || s.last_name,
		       m.recipient_id, r.first_name || ' ' || r.last_name,
		       m.subject, m.body,
		       m.reply_to,
		       rt.subject,
		       (SELECT rs.first_name || ' ' || rs.last_name FROM users rs WHERE rs.id = rt.sender_id),
		       m.read_at, m.created_at
		FROM member_messages m
		JOIN users s ON s.id = m.sender_id
		JOIN users r ON r.id = m.recipient_id
		LEFT JOIN member_messages rt ON rt.id = m.reply_to
		WHERE m.sender_id = $1 AND m.deleted_by_sender = false
		ORDER BY m.created_at DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch sent messages")
	}
	defer rows.Close()
	return c.JSON(http.StatusOK, scanMessages(rows))
}

// UnreadCount returns the number of unread inbox messages.
func (h *MessagesHandler) UnreadCount(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var count int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM member_messages
		 WHERE recipient_id = $1 AND read_at IS NULL AND deleted_by_recipient = false`, userID).Scan(&count)
	return c.JSON(http.StatusOK, map[string]int{"count": count})
}

// Get returns a single message and marks it read if the current user is the recipient.
func (h *MessagesHandler) Get(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)

	row := h.DB.QueryRow(c.Request().Context(), `
		SELECT m.id,
		       m.sender_id,    s.first_name || ' ' || s.last_name,
		       m.recipient_id, r.first_name || ' ' || r.last_name,
		       m.subject, m.body,
		       m.reply_to,
		       rt.subject,
		       (SELECT rs.first_name || ' ' || rs.last_name FROM users rs WHERE rs.id = rt.sender_id),
		       m.read_at, m.created_at
		FROM member_messages m
		JOIN users s ON s.id = m.sender_id
		JOIN users r ON r.id = m.recipient_id
		LEFT JOIN member_messages rt ON rt.id = m.reply_to
		WHERE m.id = $1 AND (m.sender_id = $2 OR m.recipient_id = $2)`, id, userID)

	var msg MemberMessage
	var readAt *time.Time
	err := row.Scan(
		&msg.ID, &msg.SenderID, &msg.SenderName,
		&msg.RecipientID, &msg.RecipientName,
		&msg.Subject, &msg.Body,
		&msg.ReplyToID, &msg.ReplyToSubject, &msg.ReplyToSenderName,
		&readAt, &msg.CreatedAt,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "message not found")
	}
	msg.ReadAt = readAt

	// Mark read if the viewer is the recipient and it hasn't been read yet.
	if msg.RecipientID == userID && readAt == nil {
		h.DB.Exec(c.Request().Context(),
			`UPDATE member_messages SET read_at = NOW() WHERE id = $1`, id)
		now := time.Now()
		msg.ReadAt = &now
	}
	return c.JSON(http.StatusOK, msg)
}

// Send creates a new message and emails the recipient.
func (h *MessagesHandler) Send(c echo.Context) error {
	senderID := c.Get("user_id").(string)
	var req struct {
		RecipientID string `json:"recipient_id"`
		Subject     string `json:"subject"`
		Body        string `json:"body"`
		ReplyTo     string `json:"reply_to"`
	}
	if err := c.Bind(&req); err != nil || req.RecipientID == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "recipient and body are required")
	}
	if req.RecipientID == senderID {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot send a message to yourself")
	}

	// Resolve names for the email notification.
	var senderFirst, senderLast, recipientFirst, recipientLast, recipientEmail string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name, last_name FROM users WHERE id = $1`, senderID).
		Scan(&senderFirst, &senderLast)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name, last_name, email FROM users WHERE id = $1`, req.RecipientID).
		Scan(&recipientFirst, &recipientLast, &recipientEmail)

	if recipientEmail == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "recipient not found")
	}

	subject := req.Subject
	if subject == "" {
		subject = "(no subject)"
	}

	var replyToPtr *string
	if req.ReplyTo != "" {
		replyToPtr = &req.ReplyTo
	}

	// If replying to a message linked to a feedback ticket, inherit that link
	// so the whole thread stays attached to the ticket.
	var feedbackID *string
	if req.ReplyTo != "" {
		var fid *string
		h.DB.QueryRow(c.Request().Context(),
			`SELECT feedback_id::text FROM member_messages WHERE id = $1`, req.ReplyTo).Scan(&fid)
		feedbackID = fid
	}

	// "Notify on first unread": only email if the recipient is currently caught up
	// with this sender (no existing unread from them). Once they have unread, later
	// replies don't re-email until they read again — so a back-and-forth never spams.
	var priorUnread int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COUNT(*) FROM member_messages
		 WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL AND deleted_by_recipient = false`,
		req.RecipientID, senderID).Scan(&priorUnread)

	var msg MemberMessage
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO member_messages (sender_id, recipient_id, subject, body, reply_to, feedback_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, sender_id, recipient_id, subject, body, reply_to, read_at, created_at`,
		senderID, req.RecipientID, subject, req.Body, replyToPtr, feedbackID,
	).Scan(&msg.ID, &msg.SenderID, &msg.RecipientID, &msg.Subject, &msg.Body,
		&msg.ReplyToID, &msg.ReadAt, &msg.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not send message")
	}

	// Log inbound reply on the feedback ticket thread
	if feedbackID != nil {
		var senderName string
		h.DB.QueryRow(c.Request().Context(),
			`SELECT first_name || ' ' || last_name FROM users WHERE id = $1`, senderID).Scan(&senderName)
		h.DB.Exec(c.Request().Context(), `
			INSERT INTO feedback_replies (feedback_id, message_id, sender_id, sender_name, body, direction)
			VALUES ($1, $2, $3, $4, $5, 'inbound')`,
			*feedbackID, msg.ID, senderID, senderName, req.Body)
	}
	msg.SenderName = senderFirst + " " + senderLast
	msg.RecipientName = recipientFirst + " " + recipientLast

	// Permanently log if either party is a board member.
	LogBoardComm(h.DB, "message", msg.ID, msg.Subject, req.Body,
		senderID, msg.SenderName, "",
		req.RecipientID, msg.RecipientName, recipientEmail)

	// Email notification — async so the API returns fast. Skipped when the
	// recipient already has unread from this sender (see priorUnread above).
	if h.Mailer != nil && priorUnread == 0 {
		senderName := senderFirst + " " + senderLast
		recipID := req.RecipientID
		go func() {
			if notifprefs.UserWantsEmail(context.Background(), h.DB, recipID, "member_message") {
				h.sendEmailNotification(recipientEmail, recipientFirst, senderName, subject, req.Body)
			}
		}()
	}

	return c.JSON(http.StatusCreated, msg)
}

// MarkAllRead marks every unread inbox message as read for the current user.
func (h *MessagesHandler) MarkAllRead(c echo.Context) error {
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`UPDATE member_messages SET read_at = NOW()
		 WHERE recipient_id = $1 AND read_at IS NULL AND deleted_by_recipient = false`, userID)
	return c.NoContent(http.StatusNoContent)
}

// Delete soft-deletes a message from the current user's perspective.
func (h *MessagesHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`UPDATE member_messages
		 SET deleted_by_sender    = CASE WHEN sender_id    = $2 THEN true ELSE deleted_by_sender    END,
		     deleted_by_recipient = CASE WHEN recipient_id = $2 THEN true ELSE deleted_by_recipient END
		 WHERE id = $1`, id, userID)
	return c.NoContent(http.StatusNoContent)
}

func (h *MessagesHandler) sendEmailNotification(to, recipientFirst, senderName, subject, body string) {
	preview := body
	if len(preview) > 200 {
		preview = preview[:200] + "…"
	}
	htmlBody := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">📬 New Message from %s</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> sent you a message:</p>
  <div style="background:#f0fdf4;border-left:4px solid #15803d;border-radius:0 8px 8px 0;padding:16px;margin:20px 0">
    <div style="font-weight:600;color:#166534;margin-bottom:8px">%s</div>
    <div style="color:#374151;white-space:pre-wrap;font-size:14px">%s</div>
  </div>
  <p style="margin-top:24px">
    <a href="%s/messages" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
      View &amp; Reply →
    </a>
  </p>
  <p style="color:#9ca3af;font-size:12px;margin-top:16px">
    You can reply directly from the member portal.
  </p>
</div>`, senderName, recipientFirst, senderName, subject, preview, h.SiteURL)

	h.Mailer.Send(to, fmt.Sprintf("Message from %s – Liveoaks TC", senderName), htmlBody)
}

// scanMessages reads rows from the inbox/sent queries into []MemberMessage.
func scanMessages(rows interface {
	Next() bool
	Scan(...any) error
	Close()
}) []MemberMessage {
	msgs := []MemberMessage{}
	for rows.Next() {
		var m MemberMessage
		var readAt *time.Time
		if err := rows.Scan(
			&m.ID, &m.SenderID, &m.SenderName,
			&m.RecipientID, &m.RecipientName,
			&m.Subject, &m.Body,
			&m.ReplyToID, &m.ReplyToSubject, &m.ReplyToSenderName,
			&readAt, &m.CreatedAt,
		); err != nil {
			continue
		}
		m.ReadAt = readAt
		msgs = append(msgs, m)
	}
	return msgs
}
