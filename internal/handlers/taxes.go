package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// TaxHandler manages the admin Taxes section: tax documents, 1099 contractor
// tracking, sales-tax summaries, and tax-exempt status / EIN.
type TaxHandler struct {
	DB        *pgxpool.Pool
	UploadDir string
}

func (h *TaxHandler) saveFile(c echo.Context, field, subdir string) (filename, originalName string, err error) {
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

// ─── Documents (filings + exemption letters) ─────────────────────────────────

type taxDocument struct {
	ID           string    `json:"id"`
	Category     string    `json:"category"`
	Label        string    `json:"label"`
	TaxYear      *int      `json:"tax_year"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	UploadedBy   *string   `json:"uploaded_by_name"`
	CreatedAt    time.Time `json:"created_at"`
}

func (h *TaxHandler) ListDocuments(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT d.id, d.category, d.label, d.tax_year, d.filename, d.original_name,
		       COALESCE(u.first_name || ' ' || u.last_name, NULL), d.created_at
		FROM tax_documents d
		LEFT JOIN users u ON u.id = d.uploaded_by
		ORDER BY d.tax_year DESC NULLS LAST, d.created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch documents")
	}
	defer rows.Close()
	docs := []taxDocument{}
	for rows.Next() {
		var d taxDocument
		if err := rows.Scan(&d.ID, &d.Category, &d.Label, &d.TaxYear, &d.Filename, &d.OriginalName, &d.UploadedBy, &d.CreatedAt); err != nil {
			continue
		}
		docs = append(docs, d)
	}
	return c.JSON(http.StatusOK, docs)
}

func (h *TaxHandler) UploadDocument(c echo.Context) error {
	userID := c.Get("user_id").(string)
	label := strings.TrimSpace(c.FormValue("label"))
	if label == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "label required")
	}
	category := c.FormValue("category")
	if category != "filing" && category != "exemption" && category != "other" {
		category = "filing"
	}
	var taxYear *int
	if y := c.FormValue("tax_year"); y != "" {
		if n, err := strconv.Atoi(y); err == nil {
			taxYear = &n
		}
	}
	filename, original, err := h.saveFile(c, "file", "tax-documents")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not upload file")
	}
	var d taxDocument
	err = h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO tax_documents (category, label, tax_year, filename, original_name, uploaded_by)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, category, label, tax_year, filename, original_name, created_at`,
		category, label, taxYear, filename, original, userID,
	).Scan(&d.ID, &d.Category, &d.Label, &d.TaxYear, &d.Filename, &d.OriginalName, &d.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save document")
	}
	return c.JSON(http.StatusCreated, d)
}

func (h *TaxHandler) DeleteDocument(c echo.Context) error {
	var filename string
	h.DB.QueryRow(c.Request().Context(),
		`DELETE FROM tax_documents WHERE id = $1 RETURNING filename`, c.Param("id")).Scan(&filename)
	if filename != "" {
		os.Remove(filepath.Join(h.UploadDir, "tax-documents", filename))
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *TaxHandler) ServeDocument(c echo.Context) error {
	filename := c.Param("filename")
	return c.File(filepath.Join(h.UploadDir, "tax-documents", filepath.Base(filename)))
}

// ─── 1099 contractors ────────────────────────────────────────────────────────

type taxContractor struct {
	ID           string    `json:"id"`
	TaxYear      int       `json:"tax_year"`
	Name         string    `json:"name"`
	AmountPaid   float64   `json:"amount_paid"`
	W9Received   bool      `json:"w9_received"`
	Form1099Sent bool      `json:"form_1099_sent"`
	Notes        string    `json:"notes"`
	CreatedAt    time.Time `json:"created_at"`
}

func (h *TaxHandler) ListContractors(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, tax_year, name, amount_paid::float8, w9_received, form_1099_sent, notes, created_at
		FROM tax_contractors ORDER BY tax_year DESC, name ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch contractors")
	}
	defer rows.Close()
	out := []taxContractor{}
	for rows.Next() {
		var t taxContractor
		if err := rows.Scan(&t.ID, &t.TaxYear, &t.Name, &t.AmountPaid, &t.W9Received, &t.Form1099Sent, &t.Notes, &t.CreatedAt); err != nil {
			continue
		}
		out = append(out, t)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *TaxHandler) CreateContractor(c echo.Context) error {
	var req taxContractor
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Name) == "" || req.TaxYear == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "name and tax_year required")
	}
	var t taxContractor
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO tax_contractors (tax_year, name, amount_paid, w9_received, form_1099_sent, notes)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, tax_year, name, amount_paid::float8, w9_received, form_1099_sent, notes, created_at`,
		req.TaxYear, strings.TrimSpace(req.Name), req.AmountPaid, req.W9Received, req.Form1099Sent, strings.TrimSpace(req.Notes),
	).Scan(&t.ID, &t.TaxYear, &t.Name, &t.AmountPaid, &t.W9Received, &t.Form1099Sent, &t.Notes, &t.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create contractor")
	}
	return c.JSON(http.StatusCreated, t)
}

func (h *TaxHandler) UpdateContractor(c echo.Context) error {
	var req taxContractor
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	ct, err := h.DB.Exec(c.Request().Context(), `
		UPDATE tax_contractors SET tax_year=$1, name=$2, amount_paid=$3, w9_received=$4,
		    form_1099_sent=$5, notes=$6, updated_at=NOW() WHERE id=$7`,
		req.TaxYear, strings.TrimSpace(req.Name), req.AmountPaid, req.W9Received, req.Form1099Sent, strings.TrimSpace(req.Notes), c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update contractor")
	}
	if ct.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "contractor not found")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *TaxHandler) DeleteContractor(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM tax_contractors WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// ─── Settings: EIN + sales-tax rate ──────────────────────────────────────────

func (h *TaxHandler) GetSettings(c echo.Context) error {
	var ein, rate string
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key='tax_ein'`).Scan(&ein)
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key='sales_tax_rate'`).Scan(&rate)
	if rate == "" {
		rate = "0"
	}
	return c.JSON(http.StatusOK, map[string]string{"ein": ein, "sales_tax_rate": rate})
}

func (h *TaxHandler) SaveSettings(c echo.Context) error {
	var body struct {
		EIN          string `json:"ein"`
		SalesTaxRate string `json:"sales_tax_rate"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	ctx := c.Request().Context()
	h.DB.Exec(ctx, `INSERT INTO settings (key,value) VALUES ('tax_ein',$1)
		ON CONFLICT (key) DO UPDATE SET value=$1`, strings.TrimSpace(body.EIN))
	h.DB.Exec(ctx, `INSERT INTO settings (key,value) VALUES ('sales_tax_rate',$1)
		ON CONFLICT (key) DO UPDATE SET value=$1`, strings.TrimSpace(body.SalesTaxRate))
	return c.NoContent(http.StatusNoContent)
}

// ─── Sales-tax summary ───────────────────────────────────────────────────────

// SalesSummary totals pro-shop / kiosk sales over an inclusive date range and
// applies the configured sales-tax rate. Dates are YYYY-MM-DD.
func (h *TaxHandler) SalesSummary(c echo.Context) error {
	start := c.QueryParam("start")
	end := c.QueryParam("end")
	if start == "" || end == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "start and end dates required")
	}
	var rateStr string
	h.DB.QueryRow(c.Request().Context(), `SELECT value FROM settings WHERE key='sales_tax_rate'`).Scan(&rateStr)
	rate, _ := strconv.ParseFloat(rateStr, 64)

	var sales float64
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT COALESCE(SUM(total),0)::float8 FROM pro_shop_purchases
		WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
		start, end).Scan(&sales)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not compute sales")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"start":         start,
		"end":           end,
		"taxable_sales": sales,
		"rate":          rate,
		"tax_collected": sales * rate / 100.0,
	})
}
