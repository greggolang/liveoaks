package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type PollsHandler struct {
	DB *pgxpool.Pool
}

type pollRow struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	Question    string         `json:"question"`
	Options     []string       `json:"options"`
	CreatedBy   string         `json:"created_by"`
	CreatorName string         `json:"creator_name"`
	CreatedAt   time.Time      `json:"created_at"`
	DeadlineAt  *time.Time     `json:"deadline_at,omitempty"`
	Status      string         `json:"status"`
	TotalVotes  int            `json:"total_votes"`
	Results     map[string]int `json:"results"`
	HasVoted    bool           `json:"has_voted"`
	MyVote      string         `json:"my_vote,omitempty"`
}

func (h *PollsHandler) scanPoll(row interface {
	Scan(...any) error
}, userID string) (*pollRow, error) {
	var p pollRow
	var optionsJSON []byte
	var resultsJSON []byte
	var myVote *string
	err := row.Scan(
		&p.ID, &p.Title, &p.Question, &optionsJSON,
		&p.CreatedBy, &p.CreatorName, &p.CreatedAt, &p.DeadlineAt,
		&p.Status, &p.TotalVotes, &resultsJSON, &myVote,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(optionsJSON, &p.Options)
	if p.Options == nil {
		p.Options = []string{}
	}
	p.Results = map[string]int{}
	_ = json.Unmarshal(resultsJSON, &p.Results)
	if myVote != nil {
		p.HasVoted = true
		p.MyVote = *myVote
	}
	return &p, nil
}

const pollSelectSQL = `
	SELECT p.id, p.title, p.question, p.options,
	       p.created_by, u.first_name || ' ' || u.last_name,
	       p.created_at, p.deadline_at, p.status,
	       COUNT(r.id) AS total_votes,
	       COALESCE(
	           (SELECT jsonb_object_agg(selected_option, cnt)
	            FROM (SELECT selected_option, COUNT(*) AS cnt FROM poll_responses WHERE poll_id = p.id GROUP BY selected_option) sub),
	           '{}'::jsonb
	       ) AS results,
	       (SELECT selected_option FROM poll_responses WHERE poll_id = p.id AND user_id = $1 LIMIT 1) AS my_vote
	FROM polls p
	LEFT JOIN users u ON u.id = p.created_by
	LEFT JOIN poll_responses r ON r.poll_id = p.id`

// List returns all active (non-expired) polls for members, including the caller's vote status.
func (h *PollsHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), pollSelectSQL+`
		WHERE p.status = 'active'
		  AND (p.deadline_at IS NULL OR p.deadline_at > NOW())
		GROUP BY p.id, u.first_name, u.last_name
		ORDER BY p.created_at DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch polls")
	}
	defer rows.Close()
	polls := []pollRow{}
	for rows.Next() {
		p, err := h.scanPoll(rows, userID)
		if err != nil {
			continue
		}
		polls = append(polls, *p)
	}
	return c.JSON(http.StatusOK, polls)
}

// Vote records a member's anonymous vote on a poll.
func (h *PollsHandler) Vote(c echo.Context) error {
	userID := c.Get("user_id").(string)
	pollID := c.Param("id")
	var req struct {
		Option string `json:"option"`
	}
	if err := c.Bind(&req); err != nil || req.Option == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "option required")
	}

	// Validate poll is active and option exists
	var optionsJSON []byte
	var status string
	var deadline *time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT options, status, deadline_at FROM polls WHERE id = $1`, pollID,
	).Scan(&optionsJSON, &status, &deadline)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "poll not found")
	}
	if status != "active" || (deadline != nil && deadline.Before(time.Now())) {
		return echo.NewHTTPError(http.StatusBadRequest, "poll is closed")
	}
	var options []string
	_ = json.Unmarshal(optionsJSON, &options)
	valid := false
	for _, o := range options {
		if o == req.Option {
			valid = true
			break
		}
	}
	if !valid {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid option")
	}

	_, err = h.DB.Exec(c.Request().Context(), `
		INSERT INTO poll_responses (poll_id, user_id, selected_option)
		VALUES ($1, $2, $3)
		ON CONFLICT (poll_id, user_id) DO UPDATE SET selected_option = $3`,
		pollID, userID, req.Option)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not record vote")
	}
	return c.NoContent(http.StatusNoContent)
}

// AdminList returns all polls with full vote counts for admins.
func (h *PollsHandler) AdminList(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), pollSelectSQL+`
		GROUP BY p.id, u.first_name, u.last_name
		ORDER BY p.created_at DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch polls")
	}
	defer rows.Close()
	polls := []pollRow{}
	for rows.Next() {
		p, err := h.scanPoll(rows, userID)
		if err != nil {
			continue
		}
		polls = append(polls, *p)
	}
	return c.JSON(http.StatusOK, polls)
}

// AdminCreate creates a new poll.
func (h *PollsHandler) AdminCreate(c echo.Context) error {
	adminID := c.Get("user_id").(string)
	var req struct {
		Title      string   `json:"title"`
		Question   string   `json:"question"`
		Options    []string `json:"options"`
		DeadlineAt *string  `json:"deadline_at"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Title == "" || req.Question == "" || len(req.Options) < 2 {
		return echo.NewHTTPError(http.StatusBadRequest, "title, question, and at least 2 options are required")
	}

	var deadlineAt *time.Time
	if req.DeadlineAt != nil && *req.DeadlineAt != "" {
		for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02T15:04:05"} {
			if t, err := time.ParseInLocation(layout, *req.DeadlineAt, time.Local); err == nil {
				deadlineAt = &t
				break
			}
		}
	}

	optionsJSON, _ := json.Marshal(req.Options)
	var id string
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO polls (title, question, options, created_by, deadline_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		req.Title, req.Question, optionsJSON, adminID, deadlineAt,
	).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create poll")
	}

	// Return the new poll via AdminList query
	userID := adminID
	row := h.DB.QueryRow(c.Request().Context(), pollSelectSQL+`
		WHERE p.id = $2
		GROUP BY p.id, u.first_name, u.last_name`, userID, id)
	p, err := h.scanPoll(row, userID)
	if err != nil {
		return c.JSON(http.StatusCreated, map[string]string{"id": id})
	}
	return c.JSON(http.StatusCreated, p)
}

// AdminClose marks a poll as closed.
func (h *PollsHandler) AdminClose(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`UPDATE polls SET status = 'closed', updated_at = NOW() WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// AdminDelete removes a poll and all its responses.
func (h *PollsHandler) AdminDelete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM polls WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
