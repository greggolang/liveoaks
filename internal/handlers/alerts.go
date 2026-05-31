package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type AlertsHandler struct {
	DB *pgxpool.Pool
}

type MemberAlert struct {
	ID          string     `json:"id"`
	Message     string     `json:"message"`
	Type        string     `json:"type"`
	CreatedAt   time.Time  `json:"created_at"`
	CreatedBy   *string    `json:"created_by_name,omitempty"`
	DismissedAt *time.Time `json:"dismissed_at,omitempty"`
}

// GetMyAlerts returns undismissed alerts for the authenticated user.
func (h *AlertsHandler) GetMyAlerts(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT a.id, a.message, a.type, a.created_at,
		       u.first_name || ' ' || u.last_name
		FROM member_alerts a
		LEFT JOIN users u ON u.id = a.created_by
		WHERE a.user_id = $1 AND a.dismissed_at IS NULL
		ORDER BY a.created_at DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch alerts")
	}
	defer rows.Close()
	alerts := []MemberAlert{}
	for rows.Next() {
		var a MemberAlert
		if err := rows.Scan(&a.ID, &a.Message, &a.Type, &a.CreatedAt, &a.CreatedBy); err != nil {
			continue
		}
		alerts = append(alerts, a)
	}
	return c.JSON(http.StatusOK, alerts)
}

// Dismiss marks an alert as dismissed by the current user.
func (h *AlertsHandler) Dismiss(c echo.Context) error {
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`UPDATE member_alerts SET dismissed_at = NOW() WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID)
	return c.NoContent(http.StatusNoContent)
}

// AdminList returns all alerts (active and dismissed) for a specific member.
func (h *AlertsHandler) AdminList(c echo.Context) error {
	targetUserID := c.Param("userId")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT a.id, a.message, a.type, a.created_at,
		       u.first_name || ' ' || u.last_name,
		       a.dismissed_at
		FROM member_alerts a
		LEFT JOIN users u ON u.id = a.created_by
		WHERE a.user_id = $1
		ORDER BY a.created_at DESC`, targetUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch alerts")
	}
	defer rows.Close()
	alerts := []MemberAlert{}
	for rows.Next() {
		var a MemberAlert
		if err := rows.Scan(&a.ID, &a.Message, &a.Type, &a.CreatedAt, &a.CreatedBy, &a.DismissedAt); err != nil {
			continue
		}
		alerts = append(alerts, a)
	}
	return c.JSON(http.StatusOK, alerts)
}

// AdminCreate creates a new alert for a member.
func (h *AlertsHandler) AdminCreate(c echo.Context) error {
	adminID := c.Get("user_id").(string)
	var req struct {
		UserID  string `json:"user_id"`
		Message string `json:"message"`
		Type    string `json:"type"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Message == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and message required")
	}
	if req.Type != "info" && req.Type != "warning" && req.Type != "danger" {
		req.Type = "info"
	}
	var a MemberAlert
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO member_alerts (user_id, message, type, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, message, type, created_at`,
		req.UserID, req.Message, req.Type, adminID,
	).Scan(&a.ID, &a.Message, &a.Type, &a.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create alert")
	}
	return c.JSON(http.StatusCreated, a)
}

// AdminDelete removes an alert permanently.
func (h *AlertsHandler) AdminDelete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM member_alerts WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
