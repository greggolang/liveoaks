package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type FeedbackHandler struct {
	DB *pgxpool.Pool
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
		`SELECT f.id, COALESCE(f.number, 0), f.user_id, f.message, f.status, f.type, f.page, f.created_at,
		        u.first_name, u.last_name, u.email
		 FROM feedback f
		 JOIN users u ON u.id = f.user_id
		 ORDER BY f.created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch feedback")
	}
	defer rows.Close()

	type Item struct {
		ID        string    `json:"id"`
		Number    int       `json:"number"`
		UserID    string    `json:"user_id"`
		Message   string    `json:"message"`
		Status    string    `json:"status"`
		Type      string    `json:"type"`
		Page      *string   `json:"page,omitempty"`
		CreatedAt time.Time `json:"created_at"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
		Email     string    `json:"email"`
	}
	items := []Item{}
	for rows.Next() {
		var i Item
		if err := rows.Scan(&i.ID, &i.Number, &i.UserID, &i.Message, &i.Status, &i.Type, &i.Page, &i.CreatedAt, &i.FirstName, &i.LastName, &i.Email); err != nil {
			continue
		}
		items = append(items, i)
	}
	return c.JSON(http.StatusOK, items)
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

func (h *FeedbackHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM feedback WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}
