package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type NotesHandler struct {
	DB *pgxpool.Pool
}

type adminNote struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Body          string  `json:"body"`
	CreatedBy     *string `json:"created_by"`
	CreatedByName string  `json:"created_by_name"`
	UpdatedBy     *string `json:"updated_by"`
	UpdatedByName string  `json:"updated_by_name"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

func (h *NotesHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT n.id, n.title, n.body,
		       n.created_by,
		       COALESCE(cu.first_name || ' ' || cu.last_name, 'Unknown') AS created_by_name,
		       n.updated_by,
		       COALESCE(uu.first_name || ' ' || uu.last_name, '') AS updated_by_name,
		       to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(n.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM admin_notes n
		LEFT JOIN users cu ON cu.id = n.created_by
		LEFT JOIN users uu ON uu.id = n.updated_by
		ORDER BY n.updated_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch notes")
	}
	defer rows.Close()

	notes := []adminNote{}
	for rows.Next() {
		var note adminNote
		if err := rows.Scan(
			&note.ID, &note.Title, &note.Body,
			&note.CreatedBy, &note.CreatedByName,
			&note.UpdatedBy, &note.UpdatedByName,
			&note.CreatedAt, &note.UpdatedAt,
		); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		notes = append(notes, note)
	}
	return c.JSON(http.StatusOK, notes)
}

func (h *NotesHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	var note adminNote
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO admin_notes (title, body, created_by, updated_by)
		VALUES ($1, $2, $3, $3)
		RETURNING id, title, body,
		          created_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = $3),
		          updated_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = $3),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Title, req.Body, userID,
	).Scan(
		&note.ID, &note.Title, &note.Body,
		&note.CreatedBy, &note.CreatedByName,
		&note.UpdatedBy, &note.UpdatedByName,
		&note.CreatedAt, &note.UpdatedAt,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create note")
	}
	return c.JSON(http.StatusCreated, note)
}

func (h *NotesHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	var note adminNote
	err := h.DB.QueryRow(c.Request().Context(), `
		UPDATE admin_notes
		SET title = $1, body = $2, updated_by = $3, updated_at = NOW()
		WHERE id = $4
		RETURNING id, title, body,
		          created_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = created_by),
		          updated_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = $3),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Title, req.Body, userID, id,
	).Scan(
		&note.ID, &note.Title, &note.Body,
		&note.CreatedBy, &note.CreatedByName,
		&note.UpdatedBy, &note.UpdatedByName,
		&note.CreatedAt, &note.UpdatedAt,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "note not found")
	}
	return c.JSON(http.StatusOK, note)
}

func (h *NotesHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM admin_notes WHERE id = $1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete note")
	}
	return c.NoContent(http.StatusNoContent)
}
