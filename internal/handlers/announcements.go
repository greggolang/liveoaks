package handlers

import (
	"net/http"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type AnnouncementsHandler struct {
	DB *pgxpool.Pool
}

func (h *AnnouncementsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT a.id, a.title, a.body, a.author_id, a.created_at, a.updated_at,
		        u.first_name, u.last_name
		 FROM announcements a
		 JOIN users u ON u.id = a.author_id
		 ORDER BY a.created_at DESC
		 LIMIT 50`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch announcements")
	}
	defer rows.Close()

	announcements := []models.Announcement{}
	for rows.Next() {
		var a models.Announcement
		a.Author = &models.User{}
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt,
			&a.Author.FirstName, &a.Author.LastName); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan announcement")
		}
		announcements = append(announcements, a)
	}
	return c.JSON(http.StatusOK, announcements)
}

func (h *AnnouncementsHandler) Create(c echo.Context) error {
	authorID := c.Get("user_id").(string)
	var req struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Title == "" || req.Body == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title and body required")
	}

	var a models.Announcement
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO announcements (title, body, author_id)
		 VALUES ($1, $2, $3)
		 RETURNING id, title, body, author_id, created_at, updated_at`,
		req.Title, req.Body, authorID,
	).Scan(&a.ID, &a.Title, &a.Body, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create announcement")
	}
	return c.JSON(http.StatusCreated, a)
}

func (h *AnnouncementsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM announcements WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}
