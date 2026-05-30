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
	}
	if err := c.Bind(&req); err != nil || len(req.Message) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "message required")
	}
	if len(req.Message) > 1000 {
		return echo.NewHTTPError(http.StatusBadRequest, "message too long (max 1000 characters)")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO feedback (user_id, message) VALUES ($1, $2)`,
		userID, req.Message)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save feedback")
	}
	return c.JSON(http.StatusCreated, map[string]bool{"success": true})
}

func (h *FeedbackHandler) AdminList(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT f.id, f.message, f.status, f.created_at,
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
		Message   string    `json:"message"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"created_at"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
		Email     string    `json:"email"`
	}
	items := []Item{}
	for rows.Next() {
		var i Item
		if err := rows.Scan(&i.ID, &i.Message, &i.Status, &i.CreatedAt, &i.FirstName, &i.LastName, &i.Email); err != nil {
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
