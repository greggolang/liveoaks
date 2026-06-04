package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// CollabDocsHandler serves member-editable rich-text documents. Concurrent edits
// are guarded with an optimistic version number, and a presence table tracks who
// currently has a document open so editors can see each other.
type CollabDocsHandler struct {
	DB *pgxpool.Pool
}

// presenceWindow defines how recently a heartbeat must have arrived for a user to
// count as "currently here".
const presenceWindow = "30 seconds"

type collabDocSummary struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Version       int    `json:"version"`
	UpdatedAt     string `json:"updated_at"`
	UpdatedByName string `json:"updated_by_name"`
	CreatedByName string `json:"created_by_name"`
	ActiveEditors int    `json:"active_editors"`
}

type collabDoc struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Body          string `json:"body"`
	Version       int    `json:"version"`
	CreatedBy     *string `json:"created_by"`
	UpdatedAt     string `json:"updated_at"`
	UpdatedByName string `json:"updated_by_name"`
	CreatedByName string `json:"created_by_name"`
}

type collabEditor struct {
	UserID  string `json:"user_id"`
	Name    string `json:"name"`
	Editing bool   `json:"editing"`
}

// List returns every document, newest first, with a live count of active editors.
func (h *CollabDocsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT d.id, d.title, d.version,
		       to_char(d.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(uu.first_name || ' ' || uu.last_name, ''),
		       COALESCE(cu.first_name || ' ' || cu.last_name, ''),
		       (SELECT COUNT(*) FROM collab_document_presence p
		         WHERE p.document_id = d.id
		           AND p.last_seen > NOW() - INTERVAL '`+presenceWindow+`')
		FROM collab_documents d
		LEFT JOIN users uu ON uu.id = d.updated_by
		LEFT JOIN users cu ON cu.id = d.created_by
		ORDER BY d.updated_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch documents")
	}
	defer rows.Close()

	docs := []collabDocSummary{}
	for rows.Next() {
		var d collabDocSummary
		if err := rows.Scan(&d.ID, &d.Title, &d.Version, &d.UpdatedAt,
			&d.UpdatedByName, &d.CreatedByName, &d.ActiveEditors); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		docs = append(docs, d)
	}
	return c.JSON(http.StatusOK, docs)
}

func (h *CollabDocsHandler) scanDoc(c echo.Context, id string) (collabDoc, error) {
	var d collabDoc
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT d.id, d.title, d.body, d.version, d.created_by,
		       to_char(d.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COALESCE(uu.first_name || ' ' || uu.last_name, ''),
		       COALESCE(cu.first_name || ' ' || cu.last_name, '')
		FROM collab_documents d
		LEFT JOIN users uu ON uu.id = d.updated_by
		LEFT JOIN users cu ON cu.id = d.created_by
		WHERE d.id = $1`, id).Scan(
		&d.ID, &d.Title, &d.Body, &d.Version, &d.CreatedBy,
		&d.UpdatedAt, &d.UpdatedByName, &d.CreatedByName)
	return d, err
}

// Get returns a single document including its full body.
func (h *CollabDocsHandler) Get(c echo.Context) error {
	d, err := h.scanDoc(c, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "document not found")
	}
	return c.JSON(http.StatusOK, d)
}

// Create makes a new (optionally titled) blank document owned by the caller.
func (h *CollabDocsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Title == "" {
		req.Title = "Untitled document"
	}

	var id string
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO collab_documents (title, body, created_by, updated_by)
		VALUES ($1, $2, $3, $3)
		RETURNING id`, req.Title, req.Body, userID).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create document")
	}
	d, err := h.scanDoc(c, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load document")
	}
	return c.JSON(http.StatusCreated, d)
}

// Update saves new title/body only if the caller's version matches what is stored
// (optimistic concurrency). On a version mismatch it returns 409 with the current
// server copy so the client can reconcile instead of silently clobbering edits.
func (h *CollabDocsHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		Title   string `json:"title"`
		Body    string `json:"body"`
		Version int    `json:"version"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	var newVersion int
	var updatedAt string
	err := h.DB.QueryRow(c.Request().Context(), `
		UPDATE collab_documents
		SET title = $1, body = $2, version = version + 1, updated_by = $3, updated_at = NOW()
		WHERE id = $4 AND version = $5
		RETURNING version, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Title, req.Body, userID, id, req.Version).Scan(&newVersion, &updatedAt)
	if err != nil {
		// No row updated: either the doc is gone or the version is stale.
		current, derr := h.scanDoc(c, id)
		if derr != nil {
			return echo.NewHTTPError(http.StatusNotFound, "document not found")
		}
		return c.JSON(http.StatusConflict, map[string]any{
			"status":   "conflict",
			"document": current,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"status":     "ok",
		"version":    newVersion,
		"updated_at": updatedAt,
	})
}

// Delete removes a document. Only its creator or an admin may delete it.
func (h *CollabDocsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	tag, err := h.DB.Exec(c.Request().Context(), `
		DELETE FROM collab_documents
		WHERE id = $1 AND (
			created_by = $2
			OR EXISTS (
				SELECT 1 FROM users u
				WHERE u.id = $2 AND (
					u.role IN ('admin', 'developer')
					OR u.extra_roles && ARRAY['admin', 'developer']
				)
			)
		)`, id, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete document")
	}
	if tag.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusForbidden, "only the document's creator or an admin can delete it")
	}
	return c.NoContent(http.StatusNoContent)
}

// Presence records a heartbeat for the caller on a document and returns who else
// is currently here, plus the document's latest version so the client can detect
// edits made by others while it had the doc open.
func (h *CollabDocsHandler) Presence(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		Editing bool `json:"editing"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	ctx := c.Request().Context()
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO collab_document_presence (document_id, user_id, editing, last_seen)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (document_id, user_id)
		DO UPDATE SET editing = $3, last_seen = NOW()`,
		id, userID, req.Editing); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not record presence")
	}

	rows, err := h.DB.Query(ctx, `
		SELECT p.user_id, COALESCE(u.first_name || ' ' || u.last_name, 'Member'), p.editing
		FROM collab_document_presence p
		JOIN users u ON u.id = p.user_id
		WHERE p.document_id = $1
		  AND p.last_seen > NOW() - INTERVAL '`+presenceWindow+`'
		ORDER BY u.first_name`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not read presence")
	}
	defer rows.Close()

	editors := []collabEditor{}
	for rows.Next() {
		var e collabEditor
		if err := rows.Scan(&e.UserID, &e.Name, &e.Editing); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		editors = append(editors, e)
	}

	var version int
	var updatedBy string
	h.DB.QueryRow(ctx, `
		SELECT d.version, COALESCE(u.first_name || ' ' || u.last_name, '')
		FROM collab_documents d
		LEFT JOIN users u ON u.id = d.updated_by
		WHERE d.id = $1`, id).Scan(&version, &updatedBy)

	return c.JSON(http.StatusOK, map[string]any{
		"editors":         editors,
		"version":         version,
		"updated_by_name": updatedBy,
	})
}

// Leave clears the caller's presence when they close a document.
func (h *CollabDocsHandler) Leave(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM collab_document_presence WHERE document_id = $1 AND user_id = $2`, id, userID)
	return c.NoContent(http.StatusNoContent)
}
