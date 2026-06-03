package handlers

import (
	"context"
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

type AppliancesHandler struct {
	DB        *pgxpool.Pool
	UploadDir string
	Mailer    interface{ Send(to, subject, body string) error }
	SiteURL   string
}

type Appliance struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Location           *string  `json:"location,omitempty"`
	Brand              *string  `json:"brand,omitempty"`
	ModelNumber        *string  `json:"model_number,omitempty"`
	SerialNumber       *string  `json:"serial_number,omitempty"`
	InstalledDate      *string  `json:"installed_date,omitempty"`
	Notes              *string  `json:"notes,omitempty"`
	ManualFilename     *string  `json:"manual_filename,omitempty"`
	ManualOriginalName *string  `json:"manual_original_name,omitempty"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
	UpdatedByName      *string  `json:"updated_by_name,omitempty"`
}

type ApplianceServiceRecord struct {
	ID            string   `json:"id"`
	ApplianceID   string   `json:"appliance_id"`
	ServiceDate   string   `json:"service_date"`
	ServiceType   string   `json:"service_type"`
	Description   *string  `json:"description,omitempty"`
	Technician    *string  `json:"technician,omitempty"`
	Cost          *float64 `json:"cost,omitempty"`
	CreatedBy     *string  `json:"created_by,omitempty"`
	CreatedByName string   `json:"created_by_name"`
	CreatedAt     string   `json:"created_at"`
}

type ApplianceReminder struct {
	ID             string  `json:"id"`
	ApplianceID    string  `json:"appliance_id"`
	Title          string  `json:"title"`
	DueDate        string  `json:"due_date"`
	RecurrenceDays *int    `json:"recurrence_days,omitempty"`
	Notes          *string `json:"notes,omitempty"`
	LastSentAt     *string `json:"last_sent_at,omitempty"`
	CreatedAt      string  `json:"created_at"`
}

func nullS(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

const applianceCols = `a.id, a.name, a.location, a.brand, a.model_number, a.serial_number,
    a.installed_date::text, a.notes, a.manual_filename, a.manual_original_name,
    to_char(a.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    to_char(a.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    COALESCE(u.first_name || ' ' || u.last_name, NULL)`

func scanAppliance(row interface{ Scan(...any) error }) (Appliance, error) {
	var a Appliance
	err := row.Scan(&a.ID, &a.Name, &a.Location, &a.Brand, &a.ModelNumber,
		&a.SerialNumber, &a.InstalledDate, &a.Notes, &a.ManualFilename,
		&a.ManualOriginalName, &a.CreatedAt, &a.UpdatedAt, &a.UpdatedByName)
	return a, err
}

func (h *AppliancesHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT `+applianceCols+` FROM appliances a LEFT JOIN users u ON u.id=a.updated_by ORDER BY a.name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch appliances")
	}
	defer rows.Close()

	result := []Appliance{}
	for rows.Next() {
		a, err := scanAppliance(rows)
		if err != nil {
			continue
		}
		result = append(result, a)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *AppliancesHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Name          string `json:"name"`
		Location      string `json:"location"`
		Brand         string `json:"brand"`
		ModelNumber   string `json:"model_number"`
		SerialNumber  string `json:"serial_number"`
		InstalledDate string `json:"installed_date"`
		Notes         string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if strings.TrimSpace(req.Name) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	a, err := scanAppliance(h.DB.QueryRow(c.Request().Context(), `
		WITH ins AS (
			INSERT INTO appliances (name, location, brand, model_number, serial_number, installed_date, notes, updated_by)
			VALUES ($1, $2, $3, $4, $5, NULLIF($6,'')::date, $7, $8)
			RETURNING *
		)
		SELECT `+applianceCols+` FROM ins a LEFT JOIN users u ON u.id=a.updated_by`,
		req.Name, nullS(req.Location), nullS(req.Brand), nullS(req.ModelNumber),
		nullS(req.SerialNumber), req.InstalledDate, nullS(req.Notes), userID))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create appliance")
	}
	return c.JSON(http.StatusCreated, a)
}

func (h *AppliancesHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		Name          string `json:"name"`
		Location      string `json:"location"`
		Brand         string `json:"brand"`
		ModelNumber   string `json:"model_number"`
		SerialNumber  string `json:"serial_number"`
		InstalledDate string `json:"installed_date"`
		Notes         string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	a, err := scanAppliance(h.DB.QueryRow(c.Request().Context(), `
		WITH upd AS (
			UPDATE appliances
			SET name=$1, location=$2, brand=$3, model_number=$4, serial_number=$5,
			    installed_date=NULLIF($6,'')::date, notes=$7, updated_at=NOW(), updated_by=$8
			WHERE id=$9
			RETURNING *
		)
		SELECT `+applianceCols+` FROM upd a LEFT JOIN users u ON u.id=a.updated_by`,
		req.Name, nullS(req.Location), nullS(req.Brand), nullS(req.ModelNumber),
		nullS(req.SerialNumber), req.InstalledDate, nullS(req.Notes), userID, id))
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "appliance not found")
	}
	return c.JSON(http.StatusOK, a)
}

func (h *AppliancesHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	var manualFilename *string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT manual_filename FROM appliances WHERE id=$1`, id).Scan(&manualFilename)

	if _, err := h.DB.Exec(c.Request().Context(), `DELETE FROM appliances WHERE id=$1`, id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete appliance")
	}
	if manualFilename != nil {
		os.Remove(filepath.Join(h.UploadDir, "appliance-manuals", *manualFilename))
	}
	return c.NoContent(http.StatusNoContent)
}

var allowedManualExts = map[string]bool{".pdf": true, ".doc": true, ".docx": true, ".txt": true}

const maxManualBytes = 20 << 20 // 20 MB

func (h *AppliancesHandler) UploadManual(c echo.Context) error {
	id := c.Param("id")
	file, header, err := c.Request().FormFile("manual")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file required")
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedManualExts[ext] {
		return echo.NewHTTPError(http.StatusBadRequest, "only PDF, DOC, DOCX, or TXT files are allowed")
	}

	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	dir := filepath.Join(h.UploadDir, "appliance-manuals")
	os.MkdirAll(dir, 0755)

	dst, err := os.Create(filepath.Join(dir, filename))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save file")
	}
	defer dst.Close()
	n, err := io.Copy(dst, io.LimitReader(file, maxManualBytes+1))
	if err != nil {
		os.Remove(filepath.Join(dir, filename))
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save file")
	}
	if n > maxManualBytes {
		os.Remove(filepath.Join(dir, filename))
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "file too large (max 20 MB)")
	}

	var old *string
	h.DB.QueryRow(c.Request().Context(), `SELECT manual_filename FROM appliances WHERE id=$1`, id).Scan(&old)
	if old != nil {
		os.Remove(filepath.Join(h.UploadDir, "appliance-manuals", *old))
	}

	userID, _ := c.Get("user_id").(string)
	a, err := scanAppliance(h.DB.QueryRow(c.Request().Context(), `
		WITH upd AS (
			UPDATE appliances SET manual_filename=$1, manual_original_name=$2, updated_at=NOW(), updated_by=$3
			WHERE id=$4 RETURNING *
		)
		SELECT `+applianceCols+` FROM upd a LEFT JOIN users u ON u.id=a.updated_by`,
		filename, header.Filename, userID, id))
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "appliance not found")
	}
	return c.JSON(http.StatusOK, a)
}

func (h *AppliancesHandler) DeleteManual(c echo.Context) error {
	id := c.Param("id")
	var filename *string
	h.DB.QueryRow(c.Request().Context(), `SELECT manual_filename FROM appliances WHERE id=$1`, id).Scan(&filename)

	if _, err := h.DB.Exec(c.Request().Context(), `
		UPDATE appliances SET manual_filename=NULL, manual_original_name=NULL, updated_at=NOW()
		WHERE id=$1`, id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not remove manual")
	}
	if filename != nil {
		os.Remove(filepath.Join(h.UploadDir, "appliance-manuals", *filename))
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *AppliancesHandler) ServeManual(c echo.Context) error {
	filename := c.Param("filename")
	if strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filename")
	}
	return c.File(filepath.Join(h.UploadDir, "appliance-manuals", filename))
}

// ── Service Records ────────────────────────────────────────────────────────

func (h *AppliancesHandler) ListServiceRecords(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT r.id, r.appliance_id, r.service_date::text, r.service_type,
		       r.description, r.technician, r.cost::float8,
		       r.created_by,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS created_by_name,
		       to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM appliance_service_records r
		LEFT JOIN users u ON u.id = r.created_by
		WHERE r.appliance_id = $1
		ORDER BY r.service_date DESC`, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch records")
	}
	defer rows.Close()

	result := []ApplianceServiceRecord{}
	for rows.Next() {
		var r ApplianceServiceRecord
		if err := rows.Scan(&r.ID, &r.ApplianceID, &r.ServiceDate, &r.ServiceType,
			&r.Description, &r.Technician, &r.Cost,
			&r.CreatedBy, &r.CreatedByName, &r.CreatedAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *AppliancesHandler) CreateServiceRecord(c echo.Context) error {
	applianceID := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		ServiceDate string   `json:"service_date"`
		ServiceType string   `json:"service_type"`
		Description string   `json:"description"`
		Technician  string   `json:"technician"`
		Cost        *float64 `json:"cost"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.ServiceDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "service_date is required")
	}
	if req.ServiceType == "" {
		req.ServiceType = "maintenance"
	}

	var r ApplianceServiceRecord
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO appliance_service_records
		    (appliance_id, service_date, service_type, description, technician, cost, created_by)
		VALUES ($1, $2::date, $3, $4, $5, $6, $7)
		RETURNING id, appliance_id, service_date::text, service_type, description, technician,
		          cost::float8, created_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id=$7),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		applianceID, req.ServiceDate, req.ServiceType, nullS(req.Description),
		nullS(req.Technician), req.Cost, userID,
	).Scan(&r.ID, &r.ApplianceID, &r.ServiceDate, &r.ServiceType, &r.Description,
		&r.Technician, &r.Cost, &r.CreatedBy, &r.CreatedByName, &r.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create record")
	}
	return c.JSON(http.StatusCreated, r)
}

func (h *AppliancesHandler) DeleteServiceRecord(c echo.Context) error {
	if _, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM appliance_service_records WHERE id=$1`, c.Param("recordId")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete record")
	}
	return c.NoContent(http.StatusNoContent)
}

// ── Reminders ──────────────────────────────────────────────────────────────

func (h *AppliancesHandler) ListReminders(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, appliance_id, title, due_date::text, recurrence_days, notes,
		       to_char(last_sent_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM appliance_reminders
		WHERE appliance_id = $1
		ORDER BY due_date ASC`, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch reminders")
	}
	defer rows.Close()

	result := []ApplianceReminder{}
	for rows.Next() {
		var r ApplianceReminder
		if err := rows.Scan(&r.ID, &r.ApplianceID, &r.Title, &r.DueDate,
			&r.RecurrenceDays, &r.Notes, &r.LastSentAt, &r.CreatedAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *AppliancesHandler) CreateReminder(c echo.Context) error {
	applianceID := c.Param("id")
	var req struct {
		Title          string `json:"title"`
		DueDate        string `json:"due_date"`
		RecurrenceDays *int   `json:"recurrence_days"`
		Notes          string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Title == "" || req.DueDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title and due_date are required")
	}

	var r ApplianceReminder
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO appliance_reminders (appliance_id, title, due_date, recurrence_days, notes)
		VALUES ($1, $2, $3::date, $4, $5)
		RETURNING id, appliance_id, title, due_date::text, recurrence_days, notes,
		          to_char(last_sent_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		applianceID, req.Title, req.DueDate, req.RecurrenceDays, nullS(req.Notes),
	).Scan(&r.ID, &r.ApplianceID, &r.Title, &r.DueDate, &r.RecurrenceDays,
		&r.Notes, &r.LastSentAt, &r.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create reminder")
	}
	return c.JSON(http.StatusCreated, r)
}

func (h *AppliancesHandler) UpdateReminder(c echo.Context) error {
	var req struct {
		Title          string `json:"title"`
		DueDate        string `json:"due_date"`
		RecurrenceDays *int   `json:"recurrence_days"`
		Notes          string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	var r ApplianceReminder
	err := h.DB.QueryRow(c.Request().Context(), `
		UPDATE appliance_reminders
		SET title=$1, due_date=$2::date, recurrence_days=$3, notes=$4
		WHERE id=$5
		RETURNING id, appliance_id, title, due_date::text, recurrence_days, notes,
		          to_char(last_sent_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Title, req.DueDate, req.RecurrenceDays, nullS(req.Notes), c.Param("reminderId"),
	).Scan(&r.ID, &r.ApplianceID, &r.Title, &r.DueDate, &r.RecurrenceDays,
		&r.Notes, &r.LastSentAt, &r.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "reminder not found")
	}
	return c.JSON(http.StatusOK, r)
}

func (h *AppliancesHandler) DeleteReminder(c echo.Context) error {
	if _, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM appliance_reminders WHERE id=$1`, c.Param("reminderId")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete reminder")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *AppliancesHandler) SendReminder(c echo.Context) error {
	ctx := c.Request().Context()
	var applianceName, title, dueDate string
	err := h.DB.QueryRow(ctx, `
		SELECT a.name, r.title, r.due_date::text
		FROM appliance_reminders r
		JOIN appliances a ON a.id = r.appliance_id
		WHERE r.id = $1`, c.Param("reminderId")).Scan(&applianceName, &title, &dueDate)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "reminder not found")
	}

	rows, err := h.DB.Query(ctx,
		`SELECT email FROM users WHERE (role = ANY($1) OR extra_roles && $1) AND status='active' AND email != ''`,
		commBoardRoles)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch board members")
	}
	defer rows.Close()

	subject := fmt.Sprintf("Appliance Reminder: %s — %s", applianceName, title)
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Appliance Service Reminder</h2>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:0"><strong>Appliance:</strong> %s</p>
    <p style="margin:8px 0 0"><strong>Service:</strong> %s</p>
    <p style="margin:8px 0 0"><strong>Due:</strong> %s</p>
  </div>
  <p><a href="%s/admin/appliances" style="color:#15803d;font-weight:600">View Appliances →</a></p>
</div>`, applianceName, title, dueDate, h.SiteURL)

	if h.Mailer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "email not configured")
	}

	var sent int
	for rows.Next() {
		var email string
		rows.Scan(&email)
		e := email
		go h.Mailer.Send(e, subject, body)
		sent++
	}

	if sent > 0 {
		h.DB.Exec(ctx, `UPDATE appliance_reminders SET last_sent_at=NOW() WHERE id=$1`, c.Param("reminderId"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"sent": sent})
}

// ── Background reminder check ──────────────────────────────────────────────

// SendDueReminders is called by the reminder service to email board members
// about appliance reminders that are due today or overdue and not yet sent today.
func (h *AppliancesHandler) SendDueReminders(ctx context.Context) {
	rows, err := h.DB.Query(ctx, `
		SELECT r.id, a.name, r.title, r.due_date::text
		FROM appliance_reminders r
		JOIN appliances a ON a.id = r.appliance_id
		WHERE r.due_date <= CURRENT_DATE
		  AND (r.last_sent_at IS NULL OR r.last_sent_at::date < CURRENT_DATE)`)
	if err != nil {
		return
	}
	defer rows.Close()

	type due struct{ id, appliance, title, dueDate string }
	var items []due
	for rows.Next() {
		var d due
		rows.Scan(&d.id, &d.appliance, &d.title, &d.dueDate)
		items = append(items, d)
	}

	if len(items) == 0 {
		return
	}
	if h.Mailer == nil {
		return
	}

	boardRows, err := h.DB.Query(ctx,
		`SELECT email FROM users WHERE (role = ANY($1) OR extra_roles && $1) AND status='active' AND email != ''`,
		commBoardRoles)
	if err != nil {
		return
	}
	var emails []string
	for boardRows.Next() {
		var e string
		boardRows.Scan(&e)
		emails = append(emails, e)
	}
	boardRows.Close()

	if len(emails) == 0 {
		return
	}

	for _, item := range items {
		subject := fmt.Sprintf("Appliance Reminder Due: %s — %s", item.appliance, item.title)
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Appliance Service Reminder</h2>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:0"><strong>Appliance:</strong> %s</p>
    <p style="margin:8px 0 0"><strong>Service:</strong> %s</p>
    <p style="margin:8px 0 0"><strong>Due:</strong> %s</p>
  </div>
  <p><a href="%s/admin/appliances" style="color:#15803d;font-weight:600">View Appliances →</a></p>
</div>`, item.appliance, item.title, item.dueDate, h.SiteURL)

		for _, email := range emails {
			e := email
			go h.Mailer.Send(e, subject, body)
		}

		h.DB.Exec(ctx, `UPDATE appliance_reminders SET last_sent_at=NOW() WHERE id=$1`, item.id)

		// Advance recurring reminders
		h.DB.Exec(ctx, `
			UPDATE appliance_reminders
			SET due_date = due_date + (recurrence_days * INTERVAL '1 day'), last_sent_at=NOW()
			WHERE id=$1 AND recurrence_days IS NOT NULL`, item.id)
	}
}
