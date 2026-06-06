package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type FeedbackHandler struct {
	DB     *pgxpool.Pool
	Mailer interface {
		Send(to, subject, body string) error
	}
	SiteURL string
}

type FeedbackReply struct {
	ID         string    `json:"id"`
	FeedbackID string    `json:"feedback_id"`
	MessageID  *string   `json:"message_id,omitempty"`
	SenderID   *string   `json:"sender_id,omitempty"`
	SenderName string    `json:"sender_name"`
	Body       string    `json:"body"`
	Direction  string    `json:"direction"`
	CreatedAt  time.Time `json:"created_at"`
}

func (h *FeedbackHandler) Submit(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Page    string `json:"page"`
	}
	if err := c.Bind(&req); err != nil || len(req.Message) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "message required")
	}
	if len(req.Message) > 1000 {
		return echo.NewHTTPError(http.StatusBadRequest, "message too long (max 1000 characters)")
	}
	if req.Type != "idea" && req.Type != "bug" {
		req.Type = "idea"
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO feedback (user_id, message, type, page) VALUES ($1, $2, $3, NULLIF($4, ''))`,
		userID, req.Message, req.Type, req.Page)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save feedback")
	}
	return c.JSON(http.StatusCreated, map[string]bool{"success": true})
}

// NewFeedback returns unread (status='new') feedback for board-level alerts.
func (h *FeedbackHandler) NewFeedback(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT f.id, COALESCE(f.number, 0), f.message, f.type, f.page, f.created_at,
		        u.first_name, u.last_name
		 FROM feedback f
		 JOIN users u ON u.id = f.user_id
		 WHERE f.status = 'new'
		 ORDER BY f.created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch feedback")
	}
	defer rows.Close()
	type Item struct {
		ID        string    `json:"id"`
		Number    int       `json:"number"`
		Message   string    `json:"message"`
		Type      string    `json:"type"`
		Page      *string   `json:"page,omitempty"`
		CreatedAt time.Time `json:"created_at"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
	}
	items := []Item{}
	for rows.Next() {
		var i Item
		if err := rows.Scan(&i.ID, &i.Number, &i.Message, &i.Type, &i.Page, &i.CreatedAt, &i.FirstName, &i.LastName); err != nil {
			continue
		}
		items = append(items, i)
	}
	return c.JSON(http.StatusOK, items)
}

func (h *FeedbackHandler) AdminList(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT f.id, COALESCE(f.number, 0), f.user_id, f.message, f.status, f.type, f.page, f.assigned_to, f.note, f.created_at,
		        u.first_name, u.last_name, u.email,
		        (SELECT COUNT(*) FROM feedback_replies fr WHERE fr.feedback_id = f.id)
		 FROM feedback f
		 JOIN users u ON u.id = f.user_id
		 ORDER BY f.created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch feedback")
	}
	defer rows.Close()

	type Item struct {
		ID           string    `json:"id"`
		Number       int       `json:"number"`
		UserID       string    `json:"user_id"`
		Message      string    `json:"message"`
		Status       string    `json:"status"`
		Type         string    `json:"type"`
		Page         *string   `json:"page,omitempty"`
		AssignedTo   *string   `json:"assigned_to,omitempty"`
		Note         *string   `json:"note,omitempty"`
		CreatedAt    time.Time `json:"created_at"`
		FirstName    string    `json:"first_name"`
		LastName     string    `json:"last_name"`
		Email        string    `json:"email"`
		ReplyCount   int       `json:"reply_count"`
	}
	items := []Item{}
	for rows.Next() {
		var i Item
		if err := rows.Scan(&i.ID, &i.Number, &i.UserID, &i.Message, &i.Status, &i.Type, &i.Page, &i.AssignedTo, &i.Note, &i.CreatedAt, &i.FirstName, &i.LastName, &i.Email, &i.ReplyCount); err != nil {
			continue
		}
		items = append(items, i)
	}
	return c.JSON(http.StatusOK, items)
}

// GetReplies returns the full communication thread for a feedback ticket.
func (h *FeedbackHandler) GetReplies(c echo.Context) error {
	id := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, feedback_id, message_id::text, sender_id::text, sender_name, body, direction, created_at
		 FROM feedback_replies
		 WHERE feedback_id = $1
		 ORDER BY created_at`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch replies")
	}
	defer rows.Close()
	replies := []FeedbackReply{}
	for rows.Next() {
		var r FeedbackReply
		if err := rows.Scan(&r.ID, &r.FeedbackID, &r.MessageID, &r.SenderID, &r.SenderName, &r.Body, &r.Direction, &r.CreatedAt); err != nil {
			continue
		}
		replies = append(replies, r)
	}
	return c.JSON(http.StatusOK, replies)
}

// Reply sends a message to the member from the feedback ticket and stores it on the ticket thread.
func (h *FeedbackHandler) Reply(c echo.Context) error {
	adminID := c.Get("user_id").(string)
	feedbackID := c.Param("id")

	var req struct {
		Body string `json:"body"`
	}
	if err := c.Bind(&req); err != nil || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "body required")
	}

	var memberID, memberEmail, memberFirst, fbType string
	var fbNumber int
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT f.user_id, u.email, u.first_name, COALESCE(f.number, 0), f.type
		FROM feedback f JOIN users u ON u.id = f.user_id
		WHERE f.id = $1`, feedbackID,
	).Scan(&memberID, &memberEmail, &memberFirst, &fbNumber, &fbType)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "feedback not found")
	}

	var adminFirst, adminLast string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name, last_name FROM users WHERE id = $1`, adminID).Scan(&adminFirst, &adminLast)
	adminName := adminFirst + " " + adminLast

	subjectLabel := "site idea"
	if fbType == "bug" {
		subjectLabel = "bug report"
	}
	subject := fmt.Sprintf("Re: Your %s (#%d)", subjectLabel, fbNumber)

	// Insert member message with feedback_id so member replies chain back here
	var msgID string
	if err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO member_messages (sender_id, recipient_id, subject, body, feedback_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		adminID, memberID, subject, req.Body, feedbackID,
	).Scan(&msgID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not send message")
	}

	// Store the reply on the ticket thread
	var reply FeedbackReply
	if err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO feedback_replies (feedback_id, message_id, sender_id, sender_name, body, direction)
		VALUES ($1, $2, $3, $4, $5, 'outbound')
		RETURNING id, feedback_id, message_id::text, sender_id::text, sender_name, body, direction, created_at`,
		feedbackID, msgID, adminID, adminName, req.Body,
	).Scan(&reply.ID, &reply.FeedbackID, &reply.MessageID, &reply.SenderID, &reply.SenderName, &reply.Body, &reply.Direction, &reply.CreatedAt); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not log reply")
	}

	// Email the member
	if h.Mailer != nil && memberEmail != "" {
		preview := req.Body
		if len(preview) > 200 {
			preview = preview[:200] + "…"
		}
		emailBody := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">📬 Update on Your %s</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> from the board replied to your submission:</p>
  <div style="background:#f0fdf4;border-left:4px solid #15803d;border-radius:0 8px 8px 0;padding:16px;margin:20px 0">
    <div style="color:#374151;white-space:pre-wrap;font-size:14px">%s</div>
  </div>
  <p style="margin-top:24px">
    <a href="%s/messages" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
      View &amp; Reply →
    </a>
  </p>
</div>`, subjectLabel, memberFirst, adminName, preview, h.SiteURL)
		go h.Mailer.Send(memberEmail, subject+" – Liveoaks TC", emailBody)
	}

	return c.JSON(http.StatusCreated, reply)
}

func (h *FeedbackHandler) UpdateStatus(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Status string `json:"status"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE feedback SET status = $1 WHERE id = $2`, req.Status, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update status")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id, "status": req.Status})
}

func (h *FeedbackHandler) UpdateAssigned(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		AssignedTo string `json:"assigned_to"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE feedback SET assigned_to = NULLIF($1, '') WHERE id = $2`, req.AssignedTo, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update assignee")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id, "assigned_to": req.AssignedTo})
}

func (h *FeedbackHandler) UpdateNote(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Note string `json:"note"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE feedback SET note = NULLIF($1, '') WHERE id = $2`, req.Note, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update note")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id, "note": req.Note})
}

func (h *FeedbackHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM feedback WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}
