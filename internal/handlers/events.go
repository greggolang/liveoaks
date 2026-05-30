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

type EventMailer interface {
	Send(to, subject, body string) error
}

type EventsHandler struct {
	DB      *pgxpool.Pool
	Mailer  EventMailer
	SiteURL string
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
		Title       string `json:"title"`
		Description string `json:"description"`
		StartTime   string `json:"start_time"`
		EndTime     string `json:"end_time"`
		EventType   string `json:"event_type"`
		Location    string `json:"location"`
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

	// Auto-create a dashboard announcement for this event
	go h.createAnnouncement(ev, authorID)

	return c.JSON(http.StatusCreated, ev)
}

func (h *EventsHandler) createAnnouncement(ev Event, authorID string) {
	desc := ""
	if ev.Description != nil {
		desc = "\n\n" + *ev.Description
	}
	loc := ""
	if ev.Location != nil {
		loc = "\n📍 " + *ev.Location
	}
	body := fmt.Sprintf("%s%s%s",
		ev.StartTime.Format("Monday, January 2, 2006 at 3:04 PM"),
		loc, desc)

	h.DB.Exec(context.Background(),
		`INSERT INTO announcements (title, body, author_id) VALUES ($1, $2, $3)`,
		"New Event: "+ev.Title, body, authorID)
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

// SendEmail sends an event email using a named template.
// If user_ids is provided, sends only to those users; otherwise sends to all active members.
func (h *EventsHandler) SendEmail(c echo.Context) error {
	if h.Mailer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "email not configured")
	}

	eventID := c.Param("id")
	var req struct {
		TemplateName string   `json:"template_name"`
		UserIDs      []string `json:"user_ids"`
	}
	c.Bind(&req)
	if req.TemplateName == "" {
		req.TemplateName = "event_announcement"
	}

	// Load event
	var ev Event
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT id, title, description, start_time, end_time, location FROM events WHERE id = $1`, eventID,
	).Scan(&ev.ID, &ev.Title, &ev.Description, &ev.StartTime, &ev.EndTime, &ev.Location)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "event not found")
	}

	// Load template
	var subject, body string
	err = h.DB.QueryRow(c.Request().Context(),
		`SELECT subject, body FROM email_templates WHERE name = $1`, req.TemplateName,
	).Scan(&subject, &body)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "email template not found")
	}

	// Build replacement map
	desc := ""
	if ev.Description != nil {
		desc = *ev.Description
	}
	loc := ""
	if ev.Location != nil {
		loc = *ev.Location
	}
	dateStr := ev.StartTime.Format("Monday, January 2, 2006 at 3:04 PM")
	if ev.EndTime != nil {
		dateStr += " – " + ev.EndTime.Format("3:04 PM")
	}
	signupURL := fmt.Sprintf("%s/events/%s/signup", h.SiteURL, ev.ID)

	replacer := strings.NewReplacer(
		"{{event_title}}", ev.Title,
		"{{event_date}}", dateStr,
		"{{event_location}}", loc,
		"{{event_description}}", desc,
		"{{signup_url}}", signupURL,
		"{{site_url}}", h.SiteURL,
	)
	subject = replacer.Replace(subject)
	body = replacer.Replace(body)

	// Resolve recipient emails
	var emails []string
	if len(req.UserIDs) > 0 {
		rows, err := h.DB.Query(c.Request().Context(),
			`SELECT email FROM users WHERE id = ANY($1) AND email IS NOT NULL ORDER BY last_name, first_name`,
			req.UserIDs)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var email string
				if rows.Scan(&email) == nil {
					emails = append(emails, email)
				}
			}
		}
	} else {
		rows, err := h.DB.Query(c.Request().Context(),
			`SELECT email FROM users WHERE status = 'active' AND email IS NOT NULL ORDER BY last_name, first_name`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var email string
				if rows.Scan(&email) == nil {
					emails = append(emails, email)
				}
			}
		}
	}

	total := len(emails)

	// Send in background, 1 per second, so the SMTP relay is not overwhelmed
	go func(subj, bod string, recipients []string) {
		for _, email := range recipients {
			h.Mailer.Send(email, subj, bod)
			time.Sleep(time.Second)
		}
	}(subject, body, emails)

	return c.JSON(http.StatusOK, map[string]interface{}{"sent": total, "subject": subject})
}
