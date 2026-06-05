package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/greggolang/liveoaks/internal/convert"
	"github.com/labstack/echo/v4"
)

// newDocFilename mirrors saveFile's naming: a nanosecond timestamp plus the given
// extension, unique enough for the documents directory.
func newDocFilename(ext string) string {
	return fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
}

// docedit.go adds in-browser editing of uploaded Word files (board only). A file
// is converted to HTML on open, edited in the same rich-text editor the
// collaborative docs use, and converted back to its original office format on
// save. PDFs can't be edited in place, so they get a best-effort "convert to an
// editable Word document" that produces a new file alongside the original.

// editableExtForFile reports whether an uploaded filename can be opened in the editor.
func editableExtForFile(filename string) bool {
	return convert.EditableExt(filepath.Ext(filename))
}

// fileVersion returns a short content hash used as an optimistic-lock token, so a
// save can detect that the file changed (someone else edited it, or it was
// re-uploaded) since it was opened.
func fileVersion(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:8]), nil
}

var (
	bodyOpenRe  = regexp.MustCompile(`(?is)<body[^>]*>`)
	bodyCloseRe = regexp.MustCompile(`(?is)</body>`)
)

// extractBody pulls the inner HTML of <body> out of a full LibreOffice HTML
// document. The browser editor expects a fragment, and the <head> styling
// LibreOffice emits is stripped by the editor's sanitizer anyway.
func extractBody(html string) string {
	if loc := bodyOpenRe.FindStringIndex(html); loc != nil {
		html = html[loc[1]:]
	}
	if loc := bodyCloseRe.FindStringIndex(html); loc != nil {
		html = html[:loc[0]]
	}
	return strings.TrimSpace(html)
}

// wrapBody turns the edited fragment back into a full HTML page for LibreOffice
// to import. The small print-style stylesheet keeps headings/lists/tables sane
// in the produced Word file.
func wrapBody(html string) string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>` +
		`body{font-family:'Liberation Serif',Georgia,serif;font-size:12pt;line-height:1.4;color:#000}` +
		`h1{font-size:20pt}h2{font-size:15pt}h3{font-size:13pt}` +
		`table{border-collapse:collapse}th,td{border:1px solid #999;padding:3pt 6pt}` +
		`</style></head><body>` + html + `</body></html>`
}

// docFileInfo looks up an uploaded document's filename and title.
func (h *UploadsHandler) docFileInfo(ctx context.Context, id string) (filename, title string, err error) {
	err = h.DB.QueryRow(ctx, `SELECT filename, title FROM documents WHERE id = $1`, id).Scan(&filename, &title)
	return
}

// GetEditableDocument converts an uploaded Word/ODT/RTF file to HTML for editing.
func (h *UploadsHandler) GetEditableDocument(c echo.Context) error {
	if !convert.Available() {
		return echo.NewHTTPError(http.StatusServiceUnavailable, convert.ErrUnavailable.Error())
	}
	id := c.Param("id")
	filename, title, err := h.docFileInfo(c.Request().Context(), id)
	if err != nil || filename == "" {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}
	if !editableExtForFile(filename) {
		return echo.NewHTTPError(http.StatusBadRequest, "this type of file can't be edited here")
	}

	path := filepath.Join(h.UploadDir, "documents", filepath.Base(filename))
	version, err := fileVersion(path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}
	html, err := convert.ToHTML(c.Request().Context(), path)
	if err != nil {
		if err == convert.ErrUnavailable {
			return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "could not open this file for editing")
	}
	return c.JSON(http.StatusOK, map[string]string{
		"id":      id,
		"title":   title,
		"body":    extractBody(html),
		"version": version,
		"format":  strings.ToUpper(strings.TrimPrefix(filepath.Ext(filename), ".")),
	})
}

// SaveEditableDocument converts edited HTML back to the file's original office
// format and overwrites it, guarding against a concurrent change with the
// content-hash version supplied when the file was opened.
func (h *UploadsHandler) SaveEditableDocument(c echo.Context) error {
	if !convert.Available() {
		return echo.NewHTTPError(http.StatusServiceUnavailable, convert.ErrUnavailable.Error())
	}
	id := c.Param("id")
	var req struct {
		Body    string `json:"body"`
		Version string `json:"version"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	filename, _, err := h.docFileInfo(c.Request().Context(), id)
	if err != nil || filename == "" {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}
	if !editableExtForFile(filename) {
		return echo.NewHTTPError(http.StatusBadRequest, "this type of file can't be edited here")
	}

	path := filepath.Join(h.UploadDir, "documents", filepath.Base(filename))
	current, err := fileVersion(path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}
	if req.Version != "" && req.Version != current {
		return echo.NewHTTPError(http.StatusConflict,
			"this file was changed since you opened it — reopen it to get the latest version before saving")
	}

	if err := convert.FromHTML(c.Request().Context(), wrapBody(req.Body), path); err != nil {
		if err == convert.ErrUnavailable {
			return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save your changes")
	}
	newVersion, _ := fileVersion(path)
	return c.JSON(http.StatusOK, map[string]string{"version": newVersion})
}

// ConvertDocumentToWord best-effort converts an uploaded PDF into a new editable
// Word document in the same folder. The original PDF is left untouched.
func (h *UploadsHandler) ConvertDocumentToWord(c echo.Context) error {
	if !convert.Available() {
		return echo.NewHTTPError(http.StatusServiceUnavailable, convert.ErrUnavailable.Error())
	}
	userID, _ := c.Get("user_id").(string)
	id := c.Param("id")

	var filename, title string
	var folderID *string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT filename, title, folder_id FROM documents WHERE id = $1`, id).Scan(&filename, &title, &folderID)
	if err != nil || filename == "" {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}
	if strings.ToLower(filepath.Ext(filename)) != ".pdf" {
		return echo.NewHTTPError(http.StatusBadRequest, "only PDF files can be converted to Word")
	}

	src := filepath.Join(h.UploadDir, "documents", filepath.Base(filename))
	newFilename := newDocFilename(".docx")
	dst := filepath.Join(h.UploadDir, "documents", newFilename)
	if err := convert.PDFToDocx(c.Request().Context(), src, dst); err != nil {
		if err == convert.ErrUnavailable {
			return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "could not convert this PDF")
	}

	newTitle := title + " (editable)"
	originalName := strings.TrimSuffix(title, filepath.Ext(title)) + ".docx"
	var doc Document
	if err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO documents (title, filename, original_name, category, folder_id, uploaded_by)
		 VALUES ($1, $2, $3, 'general', $4, $5)
		 RETURNING id, title, filename, original_name, created_at`,
		newTitle, newFilename, originalName, folderID, userID,
	).Scan(&doc.ID, &doc.Title, &doc.Filename, &doc.OriginalName, &doc.CreatedAt); err != nil {
		os.Remove(dst) // don't leave an orphaned file if the row failed to save
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save the converted document")
	}
	return c.JSON(http.StatusCreated, doc)
}
