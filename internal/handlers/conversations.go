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

// ConversationsHandler backs the group-chat side of /messages: multi-member
// conversations with a shared message stream and a per-participant read marker.
// One-to-one DMs continue to use MessagesHandler / member_messages.
type ConversationsHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
}

type convSummary struct {
	ID           string     `json:"id"`
	Title        *string    `json:"title"`
	Participants string     `json:"participants"` // comma-joined member names
	MemberCount  int        `json:"member_count"`
	LastBody     *string    `json:"last_body"`
	LastSender   *string    `json:"last_sender_name"`
	LastAt       *time.Time `json:"last_at"`
	Unread       int        `json:"unread"`
	Muted        bool       `json:"muted"`
}

type convPerson struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type convMessage struct {
	ID         string    `json:"id"`
	SenderID   *string   `json:"sender_id"`
	SenderName string    `json:"sender_name"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

// isParticipant reports whether the user belongs to a conversation.
func (h *ConversationsHandler) isParticipant(c echo.Context, convID, userID string) bool {
	var ok bool
	h.DB.QueryRow(c.Request().Context(),
		`SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)`,
		convID, userID).Scan(&ok)
	return ok
}

// List returns the user's group conversations (newest activity first), excluding
// ones they've hidden.
func (h *ConversationsHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT c.id, c.title,
		       (SELECT string_agg(u.first_name || ' ' || u.last_name, ', ' ORDER BY u.first_name)
		          FROM conversation_participants p JOIN users u ON u.id = p.user_id
		         WHERE p.conversation_id = c.id),
		       (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id),
		       (SELECT m.body FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
		       (SELECT s.first_name || ' ' || s.last_name FROM conversation_messages m
		          LEFT JOIN users s ON s.id = m.sender_id
		         WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
		       (SELECT m.created_at FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
		       (SELECT COUNT(*) FROM conversation_messages m
		         WHERE m.conversation_id = c.id AND m.sender_id <> $1
		           AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)),
		       cp.muted
		FROM conversations c
		JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
		WHERE cp.hidden = false
		ORDER BY c.updated_at DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch conversations")
	}
	defer rows.Close()

	out := []convSummary{}
	for rows.Next() {
		var s convSummary
		if err := rows.Scan(&s.ID, &s.Title, &s.Participants, &s.MemberCount,
			&s.LastBody, &s.LastSender, &s.LastAt, &s.Unread, &s.Muted); err != nil {
			continue
		}
		out = append(out, s)
	}
	return c.JSON(http.StatusOK, out)
}

// Get returns a conversation's participants and full message stream, and marks
// it read for the current user.
func (h *ConversationsHandler) Get(c echo.Context) error {
	userID := c.Get("user_id").(string)
	convID := c.Param("id")
	if !h.isParticipant(c, convID, userID) {
		return echo.NewHTTPError(http.StatusForbidden, "not in this conversation")
	}
	ctx := c.Request().Context()

	var title *string
	var muted bool
	h.DB.QueryRow(ctx, `SELECT title FROM conversations WHERE id = $1`, convID).Scan(&title)
	h.DB.QueryRow(ctx, `SELECT muted FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`, convID, userID).Scan(&muted)

	people := []convPerson{}
	prows, err := h.DB.Query(ctx, `
		SELECT u.id, u.first_name || ' ' || u.last_name
		FROM conversation_participants p JOIN users u ON u.id = p.user_id
		WHERE p.conversation_id = $1 ORDER BY u.first_name`, convID)
	if err == nil {
		for prows.Next() {
			var p convPerson
			if prows.Scan(&p.ID, &p.Name) == nil {
				people = append(people, p)
			}
		}
		prows.Close()
	}

	msgs := []convMessage{}
	mrows, err := h.DB.Query(ctx, `
		SELECT m.id, m.sender_id, s.first_name || ' ' || s.last_name, m.body, m.created_at
		FROM conversation_messages m
		LEFT JOIN users s ON s.id = m.sender_id
		WHERE m.conversation_id = $1 ORDER BY m.created_at`, convID)
	if err == nil {
		for mrows.Next() {
			var m convMessage
			var name *string
			if mrows.Scan(&m.ID, &m.SenderID, &name, &m.Body, &m.CreatedAt) == nil {
				if name != nil {
					m.SenderName = *name
				} else {
					m.SenderName = "(removed member)"
				}
				msgs = append(msgs, m)
			}
		}
		mrows.Close()
	}

	h.DB.Exec(ctx, `UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`, convID, userID)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id": convID, "title": title, "muted": muted, "participants": people, "messages": msgs,
	})
}

// Create starts a new group conversation with the given members and first message.
func (h *ConversationsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Title          string   `json:"title"`
		ParticipantIDs []string `json:"participant_ids"`
		Body           string   `json:"body"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "a message is required")
	}

	set := map[string]bool{userID: true}
	for _, id := range req.ParticipantIDs {
		if id != "" {
			set[id] = true
		}
	}
	if len(set) < 3 {
		return echo.NewHTTPError(http.StatusBadRequest, "pick at least two other members for a group")
	}

	ctx := c.Request().Context()
	var title interface{}
	if req.Title != "" {
		title = req.Title
	}

	var convID string
	if err := h.DB.QueryRow(ctx,
		`INSERT INTO conversations (title, created_by) VALUES ($1, $2) RETURNING id`,
		title, userID).Scan(&convID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create conversation")
	}

	for uid := range set {
		var lastRead interface{}
		if uid == userID {
			lastRead = time.Now()
		}
		h.DB.Exec(ctx,
			`INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
			 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, convID, uid, lastRead)
	}

	h.DB.Exec(ctx,
		`INSERT INTO conversation_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)`,
		convID, userID, req.Body)

	// Everyone is caught up at creation, so the opening message notifies them all
	// (subject to mute / preferences) — handled by the same path as a reply.
	h.notifyParticipants(convID, userID, req.Body)

	return c.JSON(http.StatusCreated, map[string]string{"id": convID})
}

// Send posts a message to a conversation. Any participant who had hidden the
// conversation gets it back (a new message resurfaces it for everyone).
func (h *ConversationsHandler) Send(c echo.Context) error {
	userID := c.Get("user_id").(string)
	convID := c.Param("id")
	if !h.isParticipant(c, convID, userID) {
		return echo.NewHTTPError(http.StatusForbidden, "not in this conversation")
	}
	var req struct {
		Body string `json:"body"`
	}
	if err := c.Bind(&req); err != nil || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "a message is required")
	}
	ctx := c.Request().Context()

	if _, err := h.DB.Exec(ctx,
		`INSERT INTO conversation_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)`,
		convID, userID, req.Body); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not send message")
	}
	h.DB.Exec(ctx, `UPDATE conversations SET updated_at = NOW() WHERE id = $1`, convID)
	h.DB.Exec(ctx, `UPDATE conversation_participants SET hidden = false WHERE conversation_id = $1`, convID)
	h.DB.Exec(ctx, `UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`, convID, userID)

	h.notifyParticipants(convID, userID, req.Body)

	return c.JSON(http.StatusCreated, map[string]string{"status": "sent"})
}

// notifyParticipants emails a group message to the members who were caught up
// (zero unread before this message), aren't muted, and want member-message email.
// "Notify on first unread": once someone has unread, replies stop emailing them
// until they read again, so a busy thread never spams.
//
// It must run AFTER the new message is inserted, so it ignores that message when
// deciding who was caught up (a member is caught up if their only unread is the
// one just sent).
func (h *ConversationsHandler) notifyParticipants(convID, senderID, body string) {
	if h.Mailer == nil {
		return
	}
	ctx := context.Background()

	var senderName, title string
	h.DB.QueryRow(ctx, `SELECT first_name || ' ' || last_name FROM users WHERE id=$1`, senderID).Scan(&senderName)
	h.DB.QueryRow(ctx, `SELECT COALESCE(title, '') FROM conversations WHERE id=$1`, convID).Scan(&title)
	groupName := title
	if groupName == "" {
		groupName = "your group conversation"
	}

	// A member is "caught up" if they have no unread other than the message just
	// sent — i.e. exactly one unread (this one) or fewer when counting != them.
	rows, err := h.DB.Query(ctx, `
		SELECT u.id, u.email, u.first_name
		FROM conversation_participants cp
		JOIN users u ON u.id = cp.user_id
		WHERE cp.conversation_id = $1 AND cp.user_id <> $2 AND cp.muted = false AND u.email <> ''
		  AND (SELECT COUNT(*) FROM conversation_messages m
		         WHERE m.conversation_id = $1 AND m.sender_id <> u.id
		           AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)) <= 1`,
		convID, senderID)
	if err != nil {
		return
	}
	type target struct{ id, email, first string }
	var targets []target
	for rows.Next() {
		var t target
		if rows.Scan(&t.id, &t.email, &t.first) == nil {
			targets = append(targets, t)
		}
	}
	rows.Close()

	for _, t := range targets {
		t := t
		go func() {
			if notifprefs.UserWantsEmail(ctx, h.DB, t.id, "member_message") {
				h.sendGroupNotification(t.email, t.first, senderName, groupName, body)
			}
		}()
	}
}

func (h *ConversationsHandler) sendGroupNotification(to, recipientFirst, senderName, groupName, body string) {
	preview := body
	if len(preview) > 200 {
		preview = preview[:200] + "…"
	}
	html := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">💬 New message in %s</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> posted in <strong>%s</strong>:</p>
  <div style="background:#f0fdf4;border-left:4px solid #15803d;border-radius:0 8px 8px 0;padding:16px;margin:20px 0">
    <div style="color:#374151;white-space:pre-wrap;font-size:14px">%s</div>
  </div>
  <p style="margin-top:24px">
    <a href="%s/messages" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Open conversation →</a>
  </p>
  <p style="color:#9ca3af;font-size:12px;margin-top:16px">You'll only get one email per conversation until you read it — or mute it from the chat.</p>
</div>`, groupName, recipientFirst, senderName, groupName, preview, h.SiteURL)

	h.Mailer.Send(to, fmt.Sprintf("New message in %s – Liveoaks TC", groupName), html)
}

// MarkRead advances the current user's read marker to now.
func (h *ConversationsHandler) MarkRead(c echo.Context) error {
	userID := c.Get("user_id").(string)
	convID := c.Param("id")
	h.DB.Exec(c.Request().Context(),
		`UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
		convID, userID)
	return c.NoContent(http.StatusNoContent)
}

// Mute toggles email notifications for the current user on one conversation.
func (h *ConversationsHandler) Mute(c echo.Context) error {
	userID := c.Get("user_id").(string)
	convID := c.Param("id")
	var req struct {
		Muted bool `json:"muted"`
	}
	c.Bind(&req)
	h.DB.Exec(c.Request().Context(),
		`UPDATE conversation_participants SET muted = $1 WHERE conversation_id = $2 AND user_id = $3`,
		req.Muted, convID, userID)
	return c.NoContent(http.StatusNoContent)
}

// Leave hides a conversation for the current user. A future message resurfaces it.
func (h *ConversationsHandler) Leave(c echo.Context) error {
	userID := c.Get("user_id").(string)
	convID := c.Param("id")
	h.DB.Exec(c.Request().Context(),
		`UPDATE conversation_participants SET hidden = true WHERE conversation_id = $1 AND user_id = $2`,
		convID, userID)
	return c.NoContent(http.StatusNoContent)
}
