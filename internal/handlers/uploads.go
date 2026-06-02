package handlers

import (
	"fmt"
	"io"
	"io/fs"
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
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Filename     string  `json:"filename"`
	OriginalName string  `json:"original_name"`
	Category     string  `json:"category"`
	FolderID     *string `json:"folder_id,omitempty"`
	UploadedBy   *string `json:"uploaded_by,omitempty"`
	CreatedAt    string  `json:"created_at"`
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
			`SELECT id, title, filename, original_name, created_at
			 FROM documents WHERE folder_id = $1 ORDER BY created_at DESC`, f.ID)
		if err != nil { continue }
		for dRows.Next() {
			var d Document
			if err := dRows.Scan(&d.ID, &d.Title, &d.Filename, &d.OriginalName, &d.CreatedAt); err != nil { continue }
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
	h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO documents (title, filename, original_name, category, folder_id, uploaded_by)
		 VALUES ($1, $2, $3, 'general', $4, $5)
		 RETURNING id, title, filename, original_name, created_at`,
		title, filename, original, fid, userID,
	).Scan(&doc.ID, &doc.Title, &doc.Filename, &doc.OriginalName, &doc.CreatedAt)
	return c.JSON(http.StatusCreated, doc)
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
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	Amount       *string   `json:"amount,omitempty"`
	ReceiptDate  *string   `json:"receipt_date,omitempty"`
	Category     string    `json:"category"`
	Notes        *string   `json:"notes,omitempty"`
	UploadedBy   *string   `json:"uploaded_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

func (h *UploadsHandler) ListReceipts(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, title, filename, original_name, amount::text, receipt_date::text,
		        category, notes, uploaded_by, created_at
		 FROM billing_receipts ORDER BY receipt_date DESC NULLS LAST, created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch receipts")
	}
	defer rows.Close()
	receipts := []Receipt{}
	for rows.Next() {
		var r Receipt
		if err := rows.Scan(&r.ID, &r.Title, &r.Filename, &r.OriginalName,
			&r.Amount, &r.ReceiptDate, &r.Category, &r.Notes, &r.UploadedBy, &r.CreatedAt); err != nil {
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
