package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type UploadsHandler struct {
	DB        *pgxpool.Pool
	UploadDir string
}

type Document struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	Category     string    `json:"category"`
	UploadedBy   *string   `json:"uploaded_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
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

func (h *UploadsHandler) ListDocuments(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, title, filename, original_name, category, uploaded_by, created_at
		 FROM documents ORDER BY category, created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch documents")
	}
	defer rows.Close()
	docs := []Document{}
	for rows.Next() {
		var d Document
		if err := rows.Scan(&d.ID, &d.Title, &d.Filename, &d.OriginalName, &d.Category, &d.UploadedBy, &d.CreatedAt); err != nil {
			continue
		}
		docs = append(docs, d)
	}
	return c.JSON(http.StatusOK, docs)
}

func (h *UploadsHandler) UploadDocument(c echo.Context) error {
	userID := c.Get("user_id").(string)
	title := c.FormValue("title")
	category := c.FormValue("category")
	if title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title required")
	}
	filename, original, err := h.saveFile(c, "file", "documents")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not upload file")
	}
	if category == "" {
		category = "general"
	}
	var doc Document
	h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO documents (title, filename, original_name, category, uploaded_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, title, filename, original_name, category, uploaded_by, created_at`,
		title, filename, original, category, userID,
	).Scan(&doc.ID, &doc.Title, &doc.Filename, &doc.OriginalName, &doc.Category, &doc.UploadedBy, &doc.CreatedAt)
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

func (h *UploadsHandler) ListPhotos(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, title, filename, description, uploaded_by, created_at
		 FROM photos ORDER BY created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch photos")
	}
	defer rows.Close()
	photos := []Photo{}
	for rows.Next() {
		var p Photo
		if err := rows.Scan(&p.ID, &p.Title, &p.Filename, &p.Description, &p.UploadedBy, &p.CreatedAt); err != nil {
			continue
		}
		photos = append(photos, p)
	}
	return c.JSON(http.StatusOK, photos)
}

func (h *UploadsHandler) UploadPhoto(c echo.Context) error {
	userID := c.Get("user_id").(string)
	title := c.FormValue("title")
	description := c.FormValue("description")
	if title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title required")
	}
	filename, _, err := h.saveFile(c, "file", "photos")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not upload file")
	}
	var p Photo
	h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO photos (title, filename, description, uploaded_by)
		 VALUES ($1, $2, NULLIF($3,''), $4)
		 RETURNING id, title, filename, description, uploaded_by, created_at`,
		title, filename, description, userID,
	).Scan(&p.ID, &p.Title, &p.Filename, &p.Description, &p.UploadedBy, &p.CreatedAt)
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
