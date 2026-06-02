package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BoardCommsHandler struct {
	DB *pgxpool.Pool
}

type BoardComm struct {
	ID         string    `json:"id"`
	SourceID   string    `json:"source_id"`
	Type       string    `json:"type"`
	Subject    string    `json:"subject"`
	Preview    string    `json:"preview"`
	FromName   string    `json:"from_name"`
	FromEmail  string    `json:"from_email"`
	FromUserID string    `json:"from_user_id"`
	ToName     string    `json:"to_name"`
	ToEmail    string    `json:"to_email"`
	ToUserID   string    `json:"to_user_id"`
	CreatedAt  time.Time `json:"created_at"`
}

var commBoardRoles = []string{
	"admin", "president", "vice_president", "secretary",
	"treasurer", "billing", "entertainment", "house_grounds",
	"membership", "usta",
}

// LogBoardComm records a communication in the permanent log if either party is
// currently a board member. It is safe to call in a goroutine — it uses a
// background context and never panics.
func LogBoardComm(db *pgxpool.Pool, commType, sourceID, subject, body,
	fromUserID, fromName, fromEmail, toUserID, toName, toEmail string) {

	go func() {
		ctx := context.Background()

		// Collect the user IDs we need to check.
		ids := make([]string, 0, 2)
		if fromUserID != "" {
			ids = append(ids, fromUserID)
		}
		if toUserID != "" {
			ids = append(ids, toUserID)
		}
		if len(ids) == 0 {
			return
		}

		var isBoardMember bool
		db.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM users
				WHERE id = ANY($1::uuid[])
				  AND (role = ANY($2) OR extra_roles && $2)
			)`, ids, commBoardRoles,
		).Scan(&isBoardMember)

		if !isBoardMember {
			return
		}

		// Use nil for empty UUIDs so the column stores NULL.
		var fromUUID, toUUID any
		if fromUserID != "" {
			fromUUID = fromUserID
		}
		if toUserID != "" {
			toUUID = toUserID
		}

		db.Exec(ctx, `
			INSERT INTO board_communications
				(comm_type, source_id, subject, body,
				 from_user_id, from_name, from_email,
				 to_user_id,   to_name,   to_email)
			VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (comm_type, source_id) DO NOTHING
		`, commType, sourceID, subject, body,
			fromUUID, fromName, fromEmail,
			toUUID, toName, toEmail)
	}()
}

// List returns board communications from the permanent log with optional filtering.
func (h *BoardCommsHandler) List(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	commType := c.QueryParam("type")
	userID := c.QueryParam("user_id")
	fromDate := c.QueryParam("from")
	toDate := c.QueryParam("to")

	args := []any{}
	idx := 1
	var conditions []string

	if q != "" {
		conditions = append(conditions, fmt.Sprintf(
			"(subject ILIKE $%d OR body ILIKE $%d OR from_name ILIKE $%d OR to_name ILIKE $%d)",
			idx, idx, idx, idx,
		))
		args = append(args, "%"+q+"%")
		idx++
	}
	if commType != "" {
		conditions = append(conditions, fmt.Sprintf("comm_type = $%d", idx))
		args = append(args, commType)
		idx++
	}
	if userID != "" {
		conditions = append(conditions, fmt.Sprintf(
			"(from_user_id::text = $%d OR to_user_id::text = $%d)", idx, idx,
		))
		args = append(args, userID)
		idx++
	}
	if fromDate != "" {
		conditions = append(conditions, fmt.Sprintf("created_at::date >= $%d::date", idx))
		args = append(args, fromDate)
		idx++
	}
	if toDate != "" {
		conditions = append(conditions, fmt.Sprintf("created_at::date <= $%d::date", idx))
		args = append(args, toDate)
		idx++
	}
	_ = idx

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	sql := fmt.Sprintf(`
		SELECT id::text, source_id::text, comm_type,
		       subject, LEFT(body, 400) AS preview,
		       from_name, from_email, COALESCE(from_user_id::text, ''),
		       to_name,   to_email,   COALESCE(to_user_id::text,   ''),
		       created_at
		FROM board_communications
		%s
		ORDER BY created_at DESC
		LIMIT 500
	`, where)

	rows, err := h.DB.Query(c.Request().Context(), sql, args...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch communications")
	}
	defer rows.Close()

	comms := []BoardComm{}
	for rows.Next() {
		var bc BoardComm
		if err := rows.Scan(
			&bc.ID, &bc.SourceID, &bc.Type,
			&bc.Subject, &bc.Preview,
			&bc.FromName, &bc.FromEmail, &bc.FromUserID,
			&bc.ToName, &bc.ToEmail, &bc.ToUserID,
			&bc.CreatedAt,
		); err != nil {
			continue
		}
		comms = append(comms, bc)
	}
	return c.JSON(http.StatusOK, comms)
}

// BoardMembers returns users with board-level roles for the filter dropdown.
func (h *BoardCommsHandler) BoardMembers(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, role FROM users
		 WHERE role NOT IN ('member','inactive') ORDER BY last_name, first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	type member struct {
		ID        string `json:"id"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Role      string `json:"role"`
	}
	members := []member{}
	for rows.Next() {
		var m member
		if rows.Scan(&m.ID, &m.FirstName, &m.LastName, &m.Email, &m.Role) == nil {
			members = append(members, m)
		}
	}
	return c.JSON(http.StatusOK, members)
}
