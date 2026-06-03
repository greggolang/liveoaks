package handlers

import (
	"net/http"
	"time"

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
		           AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at))
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
			&s.LastBody, &s.LastSender, &s.LastAt, &s.Unread); err != nil {
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
	h.DB.QueryRow(ctx, `SELECT title FROM conversations WHERE id = $1`, convID).Scan(&title)

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

	// Mark read.
	h.DB.Exec(ctx, `UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`, convID, userID)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id": convID, "title": title, "participants": people, "messages": msgs,
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

	// Build the participant set: creator plus the chosen members, deduped.
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
			lastRead = time.Now() // creator has seen their own opening message
		}
		h.DB.Exec(ctx,
			`INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
			 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, convID, uid, lastRead)
	}

	h.DB.Exec(ctx,
		`INSERT INTO conversation_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)`,
		convID, userID, req.Body)

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

	return c.JSON(http.StatusCreated, map[string]string{"status": "sent"})
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

// Leave hides a conversation for the current user (their own copy). A future
// message in it will resurface it.
func (h *ConversationsHandler) Leave(c echo.Context) error {
	userID := c.Get("user_id").(string)
	convID := c.Param("id")
	h.DB.Exec(c.Request().Context(),
		`UPDATE conversation_participants SET hidden = true WHERE conversation_id = $1 AND user_id = $2`,
		convID, userID)
	return c.NoContent(http.StatusNoContent)
}
