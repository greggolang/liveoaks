package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type EventsHandler struct {
	DB *pgxpool.Pool
}

type Event struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description *string    `json:"description,omitempty"`
	StartTime   time.Time  `json:"start_time"`
	EndTime     *time.Time `json:"end_time,omitempty"`
	EventType   string     `json:"event_type"`
	Location    *string    `json:"location,omitempty"`
	AuthorID    *string    `json:"author_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (h *EventsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, title, description, start_time, end_time, event_type, location, author_id, created_at
		 FROM events ORDER BY start_time ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch events")
	}
	defer rows.Close()

	events := []Event{}
	for rows.Next() {
		var ev Event
		if err := rows.Scan(&ev.ID, &ev.Title, &ev.Description, &ev.StartTime, &ev.EndTime,
			&ev.EventType, &ev.Location, &ev.AuthorID, &ev.CreatedAt); err != nil {
			continue
		}
		events = append(events, ev)
	}
	return c.JSON(http.StatusOK, events)
}

func (h *EventsHandler) Create(c echo.Context) error {
	authorID := c.Get("user_id").(string)
	var req struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		StartTime   string  `json:"start_time"`
		EndTime     string  `json:"end_time"`
		EventType   string  `json:"event_type"`
		Location    string  `json:"location"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" || req.StartTime == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title and start time required")
	}

	var ev Event
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO events (title, description, start_time, end_time, event_type, location, author_id)
		 VALUES ($1, NULLIF($2,''), $3, NULLIF($4,'')::timestamptz, COALESCE(NULLIF($5,''),'general'), NULLIF($6,''), $7)
		 RETURNING id, title, description, start_time, end_time, event_type, location, author_id, created_at`,
		req.Title, req.Description, req.StartTime, req.EndTime, req.EventType, req.Location, authorID,
	).Scan(&ev.ID, &ev.Title, &ev.Description, &ev.StartTime, &ev.EndTime, &ev.EventType, &ev.Location, &ev.AuthorID, &ev.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create event")
	}
	return c.JSON(http.StatusCreated, ev)
}

func (h *EventsHandler) Get(c echo.Context) error {
	id := c.Param("id")
	var ev Event
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT id, title, description, start_time, end_time, event_type, location, author_id,
		        signup_enabled, signup_deadline, max_players, created_at
		 FROM events WHERE id = $1`, id,
	).Scan(&ev.ID, &ev.Title, &ev.Description, &ev.StartTime, &ev.EndTime, &ev.EventType, &ev.Location, &ev.AuthorID,
		new(bool), new(interface{}), new(interface{}), &ev.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "event not found")
	}

	// Re-scan with full struct including signup fields
	var signupEnabled bool
	var signupDeadline *string
	var maxPlayers *int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT signup_enabled, signup_deadline::text, max_players FROM events WHERE id = $1`, id,
	).Scan(&signupEnabled, &signupDeadline, &maxPlayers)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id": ev.ID, "title": ev.Title, "description": ev.Description,
		"start_time": ev.StartTime, "end_time": ev.EndTime, "event_type": ev.EventType,
		"location": ev.Location, "signup_enabled": signupEnabled,
		"signup_deadline": signupDeadline, "max_players": maxPlayers,
	})
}

func (h *EventsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM events WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}
