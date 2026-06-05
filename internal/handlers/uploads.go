package handlers

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type UploadsHandler struct {
	DB         *pgxpool.Pool
	UploadDir  string
	FrontendFS fs.FS // fallback for bylaws.pdf embedded in the binary
}

type Document struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Filename       string  `json:"filename"`
	OriginalName   string  `json:"original_name"`
	Category       string  `json:"category"`
	FolderID       *string `json:"folder_id,omitempty"`
	UploadedBy     *string `json:"uploaded_by,omitempty"`
	UploadedByName *string   `json:"uploaded_by_name,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	AIIndexed      bool    `json:"ai_indexed"`
	Indexed        bool    `json:"indexed"` // true when doc_chunks have been built
}

type DocumentFolder struct {
	ID        string           `json:"id"`
	Name      string           `json:"name"`
	SortOrder int              `json:"sort_order"`
	ParentID  *string          `json:"parent_id,omitempty"`
	Roles     []string         `json:"roles"`
	DocCount  int              `json:"doc_count,omitempty"`
	Docs      []Document       `json:"docs,omitempty"`
	Children  []DocumentFolder `json:"children,omitempty"`
}

// buildDocumentTree converts a flat folder slice into a parent→children tree.
func buildDocumentTree(folders []DocumentFolder) []DocumentFolder {
	childrenOf := make(map[string][]int, len(folders))
	var rootIdxs []int
	for i, f := range folders {
		if f.ParentID == nil {
			rootIdxs = append(rootIdxs, i)
		} else {
			childrenOf[*f.ParentID] = append(childrenOf[*f.ParentID], i)
		}
	}
	var build func(idx int) DocumentFolder
	build = func(idx int) DocumentFolder {
		node := folders[idx]
		for _, ci := range childrenOf[node.ID] {
			node.Children = append(node.Children, build(ci))
		}
		return node
	}
	result := make([]DocumentFolder, 0, len(rootIdxs))
	for _, idx := range rootIdxs {
		result = append(result, build(idx))
	}
	return result
}

type PhotoFolder struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	SortOrder int      `json:"sort_order"`
	Roles     []string `json:"roles"`
	PhotoCount int     `json:"photo_count"`
	Photos    []Photo  `json:"photos,omitempty"`
}

type Photo struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Filename    string    `json:"filename"`
	Description *string   `json:"description,omitempty"`
	UploadedBy  *string   `json:"uploaded_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

func (h *UploadsHandler) saveFile(c echo.Context, field, subdir string) (filename, originalName string, err error) {
	file, header, err := c.Request().FormFile(field)
	if err != nil {
		return "", "", err
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	filename = fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	dir := filepath.Join(h.UploadDir, subdir)
	os.MkdirAll(dir, 0755)

	dst, err := os.Create(filepath.Join(dir, filename))
	if err != nil {
		return "", "", err
	}
	defer dst.Close()
	if _, err = io.Copy(dst, file); err != nil {
		return "", "", err
	}
	return filename, header.Filename, nil
}

// ListDocuments returns folders with their documents, filtered by the user's roles.
// Board/admin users see all folders. Regular members only see unrestricted folders
// or folders that include their role.
func (h *UploadsHandler) ListDocuments(c echo.Context) error {
	ctx := c.Request().Context()
	role, _ := c.Get("role").(string)
	extra, _ := c.Get("extra_roles").([]string)
	roles := append([]string{role}, extra...)

	isAdmin := false
	for _, r := range roles {
		if r == "admin" { isAdmin = true; break }
	}

	var folderQuery string
	var folderArgs []interface{}
	if isAdmin {
		folderQuery = `SELECT id, name, sort_order, parent_id FROM document_folders ORDER BY sort_order, name`
	} else {
		folderQuery = `SELECT id, name, sort_order, parent_id FROM document_folders
		               WHERE NOT EXISTS (SELECT 1 FROM document_folder_roles WHERE folder_id = document_folders.id)
		                  OR EXISTS (SELECT 1 FROM document_folder_roles WHERE folder_id = document_folders.id AND role = ANY($1))
		               ORDER BY sort_order, name`
		folderArgs = []interface{}{roles}
	}

	fRows, err := h.DB.Query(ctx, folderQuery, folderArgs...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch folders")
	}
	defer fRows.Close()
	folders := []DocumentFolder{}
	for fRows.Next() {
		var f DocumentFolder
		if err := fRows.Scan(&f.ID, &f.Name, &f.SortOrder, &f.ParentID); err != nil { continue }
		f.Roles = []string{}
		f.Docs = []Document{}
		folders = append(folders, f)
	}
	fRows.Close()

	// Fetch documents for each folder
	for i, f := range folders {
		dRows, err := h.DB.Query(ctx,
			`SELECT d.id, d.title, d.filename, d.original_name, d.created_at,
			        COALESCE(u.first_name || ' ' || u.last_name, NULL), d.ai_indexed,
			        (d.indexed_at IS NOT NULL) AS indexed
			 FROM documents d
			 LEFT JOIN users u ON u.id = d.uploaded_by
			 WHERE d.folder_id = $1 ORDER BY d.created_at DESC`, f.ID)
		if err != nil { continue }
		for dRows.Next() {
			var d Document
			if err := dRows.Scan(&d.ID, &d.Title, &d.Filename, &d.OriginalName, &d.CreatedAt, &d.UploadedByName, &d.AIIndexed, &d.Indexed); err != nil { continue }
			folders[i].Docs = append(folders[i].Docs, d)
		}
		dRows.Close()
	}

	return c.JSON(http.StatusOK, buildDocumentTree(folders))
}

// AdminListFolders returns all folders with their role permissions and doc counts (board+).
func (h *UploadsHandler) AdminListFolders(c echo.Context) error {
	ctx := c.Request().Context()
	rows, err := h.DB.Query(ctx,
		`SELECT df.id, df.name, df.sort_order, df.parent_id,
		        (SELECT COUNT(*) FROM documents WHERE folder_id = df.id) AS doc_count
		 FROM document_folders df
		 ORDER BY df.sort_order, df.name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch folders")
	}
	defer rows.Close()
	folders := []DocumentFolder{}
	for rows.Next() {
		var f DocumentFolder
		if err := rows.Scan(&f.ID, &f.Name, &f.SortOrder, &f.ParentID, &f.DocCount); err != nil { continue }
		f.Roles = []string{}
		folders = append(folders, f)
	}
	rows.Close()
	// Fetch roles for each folder
	for i, f := range folders {
		rRows, _ := h.DB.Query(ctx, `SELECT role FROM document_folder_roles WHERE folder_id = $1 ORDER BY role`, f.ID)
		if rRows != nil {
			for rRows.Next() {
				var r string
				if rRows.Scan(&r) == nil { folders[i].Roles = append(folders[i].Roles, r) }
			}
			rRows.Close()
		}
	}
	return c.JSON(http.StatusOK, buildDocumentTree(folders))
}

// CreateFolder creates a new document folder with optional role restrictions.
func (h *UploadsHandler) CreateFolder(c echo.Context) error {
	var req struct {
		Name      string   `json:"name"`
		SortOrder int      `json:"sort_order"`
		Roles     []string `json:"roles"`
		ParentID  *string  `json:"parent_id"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	var id string
	if err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO document_folders (name, sort_order, parent_id) VALUES ($1, $2, $3) RETURNING id`,
		req.Name, req.SortOrder, req.ParentID).Scan(&id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create folder")
	}
	for _, role := range req.Roles {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO document_folder_roles (folder_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, role)
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": id})
}

// UpdateFolder renames a folder and replaces its role list.
func (h *UploadsHandler) UpdateFolder(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name      string   `json:"name"`
		SortOrder int      `json:"sort_order"`
		Roles     []string `json:"roles"`
		ParentID  *string  `json:"parent_id"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	h.DB.Exec(c.Request().Context(),
		`UPDATE document_folders SET name=$1, sort_order=$2, parent_id=$3 WHERE id=$4`, req.Name, req.SortOrder, req.ParentID, id)
	h.DB.Exec(c.Request().Context(), `DELETE FROM document_folder_roles WHERE folder_id=$1`, id)
	for _, role := range req.Roles {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO document_folder_roles (folder_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, role)
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

// DeleteFolder deletes a folder and orphans (unlinks) its documents.
func (h *UploadsHandler) DeleteFolder(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `UPDATE documents SET folder_id = NULL WHERE folder_id = $1`, id)
	h.DB.Exec(c.Request().Context(), `DELETE FROM document_folders WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}

func (h *UploadsHandler) UploadDocument(c echo.Context) error {
	userID := c.Get("user_id").(string)
	title := c.FormValue("title")
	folderID := c.FormValue("folder_id")
	if title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title required")
	}
	filename, original, err := h.saveFile(c, "file", "documents")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not upload file")
	}
	var fid *string
	if folderID != "" { fid = &folderID }
	var doc Document
	if err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO documents (title, filename, original_name, category, folder_id, uploaded_by)
		 VALUES ($1, $2, $3, 'general', $4, $5)
		 RETURNING id, title, filename, original_name, created_at`,
		title, filename, original, fid, userID,
	).Scan(&doc.ID, &doc.Title, &doc.Filename, &doc.OriginalName, &doc.CreatedAt); err != nil {
		// Surface a real failure instead of returning a misleading 201 with an
		// empty document (which makes uploads look successful but vanish).
		folderLog := "<none>"
		if fid != nil {
			folderLog = *fid
		}
		log.Printf("UploadDocument insert failed (folder_id=%s uploaded_by=%s title=%q): %v", folderLog, userID, title, err)
		msg := "could not save document record"
		if strings.Contains(err.Error(), "documents_folder_id_fkey") {
			msg = "that folder no longer exists — refresh the page and try again"
		}
		return echo.NewHTTPError(http.StatusBadRequest, msg)
	}
	// Auto-index text-based files immediately so they're searchable without a manual reindex.
	// PDFs require an AI extraction pass — they stay as indexed_at=NULL for the batch reindex.
	if isTextFile(filename) {
		go h.indexTextDocument(context.Background(), doc.ID, filename)
	}
	return c.JSON(http.StatusCreated, doc)
}

// isTextFile reports whether a file can be indexed without AI (plain text read).
func isTextFile(filename string) bool {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".txt", ".md", ".markdown", ".csv", ".log":
		return true
	}
	return false
}

// indexTextDocument indexes a plain-text document (no AI needed) by chunking it
// and storing the chunks in doc_chunks. PDFs and other types must go through the
// AI-powered batch Reindex instead.
func (h *UploadsHandler) indexTextDocument(ctx context.Context, id, filename string) {
	if !isTextFile(filename) {
		return
	}
	data, err := os.ReadFile(filepath.Join(h.UploadDir, "documents", filepath.Base(filename)))
	if err != nil || len(data) == 0 {
		return
	}
	chunks := chunkText(string(data), 1500)
	if len(chunks) > 300 {
		chunks = chunks[:300]
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	tx.Exec(ctx, `DELETE FROM doc_chunks WHERE document_id = $1`, id)
	for i, ch := range chunks {
		tx.Exec(ctx, `INSERT INTO doc_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3)`, id, i, ch)
	}
	tx.Exec(ctx, `UPDATE documents SET indexed_at = NOW() WHERE id = $1`, id)
	tx.Commit(ctx)
}

// SetDocAIIndexed toggles whether the AI assistant may read a document's full
// contents for regular members (board+). Enabling also triggers indexing:
// text files are indexed immediately; PDFs are queued for the batch reindex.
func (h *UploadsHandler) SetDocAIIndexed(c echo.Context) error {
	var req struct {
		Indexed bool `json:"indexed"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(),
		`UPDATE documents SET ai_indexed = $1 WHERE id = $2`, req.Indexed, id)

	if req.Indexed {
		var filename string
		h.DB.QueryRow(c.Request().Context(), `SELECT filename FROM documents WHERE id = $1`, id).Scan(&filename)
		if isTextFile(filename) {
			// Index immediately (no AI required for text files).
			go h.indexTextDocument(context.Background(), id, filename)
		} else if strings.ToLower(filepath.Ext(filename)) == ".pdf" {
			// PDF needs AI extraction — queue it by clearing indexed_at if not yet indexed.
			var hasChunks bool
			h.DB.QueryRow(c.Request().Context(),
				`SELECT EXISTS(SELECT 1 FROM doc_chunks WHERE document_id = $1)`, id).Scan(&hasChunks)
			if !hasChunks {
				h.DB.Exec(c.Request().Context(), `UPDATE documents SET indexed_at = NULL WHERE id = $1`, id)
			}
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *UploadsHandler) DeleteDocument(c echo.Context) error {
	id := c.Param("id")
	var filename string
	h.DB.QueryRow(c.Request().Context(), `DELETE FROM documents WHERE id = $1 RETURNING filename`, id).Scan(&filename)
	if filename != "" {
		os.Remove(filepath.Join(h.UploadDir, "documents", filename))
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *UploadsHandler) ServeDocument(c echo.Context) error {
	filename := c.Param("filename")
	path := filepath.Join(h.UploadDir, "documents", filepath.Base(filename))
	return c.File(path)
}

// ListPhotos returns photo folders with their photos, filtered by user's roles.
func (h *UploadsHandler) ListPhotos(c echo.Context) error {
	ctx := c.Request().Context()
	role, _ := c.Get("role").(string)
	extra, _ := c.Get("extra_roles").([]string)
	roles := append([]string{role}, extra...)
	isAdmin := false
	for _, r := range roles {
		if r == "admin" { isAdmin = true; break }
	}

	var folderQuery string
	var folderArgs []interface{}
	if isAdmin {
		folderQuery = `SELECT id, name, sort_order FROM photo_folders ORDER BY sort_order, name`
	} else {
		folderQuery = `SELECT id, name, sort_order FROM photo_folders
		               WHERE NOT EXISTS (SELECT 1 FROM photo_folder_roles WHERE folder_id = photo_folders.id)
		                  OR EXISTS (SELECT 1 FROM photo_folder_roles WHERE folder_id = photo_folders.id AND role = ANY($1))
		               ORDER BY sort_order, name`
		folderArgs = []interface{}{roles}
	}

	fRows, err := h.DB.Query(ctx, folderQuery, folderArgs...)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch photo folders")
	}
	defer fRows.Close()
	folders := []PhotoFolder{}
	for fRows.Next() {
		var f PhotoFolder
		if err := fRows.Scan(&f.ID, &f.Name, &f.SortOrder); err != nil { continue }
		f.Roles = []string{}
		f.Photos = []Photo{}
		folders = append(folders, f)
	}
	fRows.Close()

	for i, f := range folders {
		pRows, err := h.DB.Query(ctx,
			`SELECT id, title, filename, description, created_at FROM photos WHERE folder_id = $1 ORDER BY created_at DESC`, f.ID)
		if err != nil { continue }
		for pRows.Next() {
			var p Photo
			if err := pRows.Scan(&p.ID, &p.Title, &p.Filename, &p.Description, &p.CreatedAt); err != nil { continue }
			folders[i].Photos = append(folders[i].Photos, p)
		}
		pRows.Close()
	}
	return c.JSON(http.StatusOK, folders)
}

// AdminListPhotoFolders returns all photo folders with permissions and counts.
func (h *UploadsHandler) AdminListPhotoFolders(c echo.Context) error {
	ctx := c.Request().Context()
	rows, err := h.DB.Query(ctx,
		`SELECT pf.id, pf.name, pf.sort_order,
		        (SELECT COUNT(*) FROM photos WHERE folder_id = pf.id) AS photo_count
		 FROM photo_folders pf ORDER BY pf.sort_order, pf.name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch photo folders")
	}
	defer rows.Close()
	folders := []PhotoFolder{}
	for rows.Next() {
		var f PhotoFolder
		if err := rows.Scan(&f.ID, &f.Name, &f.SortOrder, &f.PhotoCount); err != nil { continue }
		f.Roles = []string{}
		folders = append(folders, f)
	}
	rows.Close()
	for i, f := range folders {
		rRows, _ := h.DB.Query(ctx, `SELECT role FROM photo_folder_roles WHERE folder_id = $1 ORDER BY role`, f.ID)
		if rRows != nil {
			for rRows.Next() {
				var r string
				if rRows.Scan(&r) == nil { folders[i].Roles = append(folders[i].Roles, r) }
			}
			rRows.Close()
		}
	}
	return c.JSON(http.StatusOK, folders)
}

// CreatePhotoFolder creates a photo folder with optional role restrictions.
func (h *UploadsHandler) CreatePhotoFolder(c echo.Context) error {
	var req struct {
		Name      string   `json:"name"`
		SortOrder int      `json:"sort_order"`
		Roles     []string `json:"roles"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	var id string
	if err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO photo_folders (name, sort_order) VALUES ($1, $2) RETURNING id`,
		req.Name, req.SortOrder).Scan(&id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create folder")
	}
	for _, role := range req.Roles {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO photo_folder_roles (folder_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, role)
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": id})
}

// UpdatePhotoFolder renames a photo folder and replaces its role list.
func (h *UploadsHandler) UpdatePhotoFolder(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name      string   `json:"name"`
		SortOrder int      `json:"sort_order"`
		Roles     []string `json:"roles"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	h.DB.Exec(c.Request().Context(),
		`UPDATE photo_folders SET name=$1, sort_order=$2 WHERE id=$3`, req.Name, req.SortOrder, id)
	h.DB.Exec(c.Request().Context(), `DELETE FROM photo_folder_roles WHERE folder_id=$1`, id)
	for _, role := range req.Roles {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO photo_folder_roles (folder_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, role)
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

// DeletePhotoFolder deletes a photo folder and orphans its photos.
func (h *UploadsHandler) DeletePhotoFolder(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `UPDATE photos SET folder_id = NULL WHERE folder_id = $1`, id)
	h.DB.Exec(c.Request().Context(), `DELETE FROM photo_folders WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}

func (h *UploadsHandler) UploadPhoto(c echo.Context) error {
	userID := c.Get("user_id").(string)
	title := c.FormValue("title")
	description := c.FormValue("description")
	folderID := c.FormValue("folder_id")
	if title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title required")
	}
	filename, _, err := h.saveFile(c, "file", "photos")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not upload file")
	}
	var fid *string
	if folderID != "" { fid = &folderID }
	var p Photo
	h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO photos (title, filename, description, folder_id, uploaded_by)
		 VALUES ($1, $2, NULLIF($3,''), $4, $5)
		 RETURNING id, title, filename, description, created_at`,
		title, filename, description, fid, userID,
	).Scan(&p.ID, &p.Title, &p.Filename, &p.Description, &p.CreatedAt)
	return c.JSON(http.StatusCreated, p)
}

func (h *UploadsHandler) DeletePhoto(c echo.Context) error {
	id := c.Param("id")
	var filename string
	h.DB.QueryRow(c.Request().Context(), `DELETE FROM photos WHERE id = $1 RETURNING filename`, id).Scan(&filename)
	if filename != "" {
		os.Remove(filepath.Join(h.UploadDir, "photos", filename))
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *UploadsHandler) ServePhoto(c echo.Context) error {
	filename := c.Param("filename")
	path := filepath.Join(h.UploadDir, "photos", filepath.Base(filename))
	return c.File(path)
}

type Receipt struct {
	ID             string    `json:"id"`
	Title          string    `json:"title"`
	Filename       string    `json:"filename"`
	OriginalName   string    `json:"original_name"`
	Amount         *string   `json:"amount,omitempty"`
	ReceiptDate    *string   `json:"receipt_date,omitempty"`
	Category       string    `json:"category"`
	Notes          *string   `json:"notes,omitempty"`
	UploadedBy     *string   `json:"uploaded_by,omitempty"`
	UploadedByName *string   `json:"uploaded_by_name,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

func (h *UploadsHandler) ListReceipts(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT r.id, r.title, r.filename, r.original_name, r.amount::text, r.receipt_date::text,
		        r.category, r.notes, r.uploaded_by, r.created_at,
		        COALESCE(u.first_name || ' ' || u.last_name, NULL)
		 FROM billing_receipts r
		 LEFT JOIN users u ON u.id = r.uploaded_by
		 ORDER BY r.receipt_date DESC NULLS LAST, r.created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch receipts")
	}
	defer rows.Close()
	receipts := []Receipt{}
	for rows.Next() {
		var r Receipt
		if err := rows.Scan(&r.ID, &r.Title, &r.Filename, &r.OriginalName,
			&r.Amount, &r.ReceiptDate, &r.Category, &r.Notes, &r.UploadedBy, &r.CreatedAt, &r.UploadedByName); err != nil {
			continue
		}
		receipts = append(receipts, r)
	}
	return c.JSON(http.StatusOK, receipts)
}

func (h *UploadsHandler) UploadReceipt(c echo.Context) error {
	userID := c.Get("user_id").(string)
	title := c.FormValue("title")
	if title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title required")
	}
	amount := c.FormValue("amount")
	receiptDate := c.FormValue("receipt_date")
	category := c.FormValue("category")
	notes := c.FormValue("notes")
	if category == "" {
		category = "general"
	}

	filename, original, err := h.saveFile(c, "file", "receipts")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not upload file")
	}

	var r Receipt
	h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO billing_receipts
		   (title, filename, original_name, amount, receipt_date, category, notes, uploaded_by)
		 VALUES ($1,$2,$3,NULLIF($4,'')::numeric,NULLIF($5,'')::date,
		         $6,NULLIF($7,''),$8)
		 RETURNING id, title, filename, original_name, amount::text, receipt_date::text,
		           category, notes, uploaded_by, created_at`,
		title, filename, original, amount, receiptDate, category, notes, userID,
	).Scan(&r.ID, &r.Title, &r.Filename, &r.OriginalName,
		&r.Amount, &r.ReceiptDate, &r.Category, &r.Notes, &r.UploadedBy, &r.CreatedAt)
	return c.JSON(http.StatusCreated, r)
}

func (h *UploadsHandler) DeleteReceipt(c echo.Context) error {
	id := c.Param("id")
	var filename string
	h.DB.QueryRow(c.Request().Context(),
		`DELETE FROM billing_receipts WHERE id = $1 RETURNING filename`, id).Scan(&filename)
	if filename != "" {
		os.Remove(filepath.Join(h.UploadDir, "receipts", filename))
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *UploadsHandler) ServeReceipt(c echo.Context) error {
	filename := c.Param("filename")
	path := filepath.Join(h.UploadDir, "receipts", filepath.Base(filename))
	return c.File(path)
}

// UploadAvatar stores the caller's profile photo, replacing any previous one,
// and records the filename on their user row.
func (h *UploadsHandler) UploadAvatar(c echo.Context) error {
	userID := c.Get("user_id").(string)
	file, header, err := c.Request().FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file required")
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		return echo.NewHTTPError(http.StatusBadRequest, "please upload a JPG, PNG, WEBP or GIF image")
	}

	dir := filepath.Join(h.UploadDir, "avatars")
	os.MkdirAll(dir, 0755)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	dst, err := os.Create(filepath.Join(dir, filename))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save image")
	}
	defer dst.Close()
	if _, err = io.Copy(dst, file); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not write image")
	}

	ctx := c.Request().Context()
	var old *string
	h.DB.QueryRow(ctx, `SELECT photo_filename FROM users WHERE id = $1`, userID).Scan(&old)
	h.DB.Exec(ctx, `UPDATE users SET photo_filename = $1 WHERE id = $2`, filename, userID)
	if old != nil && *old != "" {
		os.Remove(filepath.Join(dir, *old))
	}
	return c.JSON(http.StatusOK, map[string]string{"photo_url": "/uploads/avatars/" + filename})
}

// DeleteAvatar removes the caller's profile photo.
func (h *UploadsHandler) DeleteAvatar(c echo.Context) error {
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()
	var old *string
	h.DB.QueryRow(ctx, `SELECT photo_filename FROM users WHERE id = $1`, userID).Scan(&old)
	h.DB.Exec(ctx, `UPDATE users SET photo_filename = NULL WHERE id = $1`, userID)
	if old != nil && *old != "" {
		os.Remove(filepath.Join(h.UploadDir, "avatars", *old))
	}
	return c.NoContent(http.StatusNoContent)
}

// ServeAvatar serves a member profile photo.
func (h *UploadsHandler) ServeAvatar(c echo.Context) error {
	filename := c.Param("filename")
	return c.File(filepath.Join(h.UploadDir, "avatars", filepath.Base(filename)))
}

// BylawsMeta returns the modification time of the uploaded bylaws PDF, or null if none exists.
func (h *UploadsHandler) BylawsMeta(c echo.Context) error {
	info, err := os.Stat(filepath.Join(h.UploadDir, "bylaws.pdf"))
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"uploaded_at": nil})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"uploaded_at": info.ModTime()})
}

// ServeBylaws serves the bylaws PDF, preferring an uploaded version over the embedded fallback.
func (h *UploadsHandler) ServeBylaws(c echo.Context) error {
	customPath := filepath.Join(h.UploadDir, "bylaws.pdf")
	if _, err := os.Stat(customPath); err == nil {
		c.Response().Header().Set("Content-Disposition", `attachment; filename="LiveOaks_Bylaws.pdf"`)
		return c.File(customPath)
	}
	// Fall back to the copy embedded in the binary
	if h.FrontendFS != nil {
		f, err := h.FrontendFS.Open("bylaws.pdf")
		if err == nil {
			defer f.Close()
			c.Response().Header().Set("Content-Disposition", `attachment; filename="LiveOaks_Bylaws.pdf"`)
			return c.Stream(http.StatusOK, "application/pdf", f)
		}
	}
	return echo.NewHTTPError(http.StatusNotFound, "bylaws not found")
}

// UploadBylaws replaces the active bylaws PDF.
func (h *UploadsHandler) UploadBylaws(c echo.Context) error {
	file, header, err := c.Request().FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file required")
	}
	defer file.Close()
	if ext := strings.ToLower(filepath.Ext(header.Filename)); ext != ".pdf" {
		return echo.NewHTTPError(http.StatusBadRequest, "only PDF files are accepted")
	}
	os.MkdirAll(h.UploadDir, 0755)
	dst, err := os.Create(filepath.Join(h.UploadDir, "bylaws.pdf"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save file")
	}
	defer dst.Close()
	if _, err = io.Copy(dst, file); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not write file")
	}
	info, _ := os.Stat(filepath.Join(h.UploadDir, "bylaws.pdf"))
	return c.JSON(http.StatusOK, map[string]interface{}{"uploaded_at": info.ModTime()})
}
