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

type WaitlistMailer interface {
	Send(to, subject, body string) error
}

type WaitlistHandler struct {
	DB      *pgxpool.Pool
	Mailer  WaitlistMailer
	SiteURL string
}

type WaitlistEntry struct {
	ID              string    `json:"id"`
	FirstName       string    `json:"first_name"`
	LastName        string    `json:"last_name"`
	Email           *string   `json:"email,omitempty"`
	Phone           *string   `json:"phone,omitempty"`
	Notes           *string   `json:"notes,omitempty"`
	AdminNotes      *string   `json:"admin_notes,omitempty"`
	USTARanking     *string   `json:"usta_ranking,omitempty"`
	Status          string    `json:"status"`
	Position        *int      `json:"position,omitempty"`
	ApplicationDate *string   `json:"application_date,omitempty"` // "YYYY-MM-DD"
	CreatedAt       time.Time `json:"created_at"`
}

// Join records a new membership request (status = new_request) and notifies
// the membership board members by email.
func (h *WaitlistHandler) Join(c echo.Context) error {
	var req struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
		Notes     string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO waitlist (first_name, last_name, email, phone, notes, status, application_date)
		 VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), 'new_request', CURRENT_DATE)`,
		req.FirstName, req.LastName, req.Email, req.Phone, req.Notes)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "a request with this email already exists")
	}

	// Notify membership board members asynchronously so the response is instant.
	if h.Mailer != nil && req.Email != "" {
		go h.notifyMembershipBoard(req.FirstName, req.LastName, req.Email)
	}

	return c.JSON(http.StatusCreated, map[string]string{
		"message": "Your membership request has been received. We'll be in touch soon.",
	})
}

// notifyMembershipBoard emails all active users with the membership role/extra-role.
func (h *WaitlistHandler) notifyMembershipBoard(firstName, lastName, email string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx,
		`SELECT u.email, u.first_name FROM users u
		 WHERE (u.role = 'membership' OR 'membership' = ANY(u.extra_roles))
		   AND u.status = 'active'`)
	if err != nil {
		return
	}
	defer rows.Close()

	reviewURL := h.SiteURL + "/admin/member-requests"
	subject := fmt.Sprintf("New Membership Request: %s %s", firstName, lastName)
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <p style="font-size:16px;color:#1b2d1d;margin:0 0 16px">A new membership request has been submitted and is waiting for your review.</p>
  <table style="width:100%%;border-collapse:collapse;margin:0 0 24px">
    <tr>
      <td style="padding:8px 16px 8px 0;color:#6b7280;white-space:nowrap;vertical-align:top">Name</td>
      <td style="padding:8px 0;font-weight:600;color:#1b2d1d">%s %s</td>
    </tr>
    <tr>
      <td style="padding:8px 16px 8px 0;color:#6b7280;white-space:nowrap;vertical-align:top">Email</td>
      <td style="padding:8px 0;color:#1b2d1d">%s</td>
    </tr>
  </table>
  <a href="%s" style="display:inline-block;background:#375d3a;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Review Request →</a>
</div>`, firstName, lastName, email, reviewURL)

	for rows.Next() {
		var to, name string
		if rows.Scan(&to, &name) == nil && to != "" {
			h.Mailer.Send(to, subject, body) //nolint
		}
	}
}

// List returns official waitlist entries (all statuses except new_request).
func (h *WaitlistHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, phone, notes, admin_notes,
		        usta_ranking, status, position,
		        to_char(application_date, 'YYYY-MM-DD'), created_at
		 FROM waitlist
		 WHERE status != 'new_request'
		 ORDER BY COALESCE(position, 99999), created_at ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch waitlist")
	}
	defer rows.Close()

	entries := []WaitlistEntry{}
	for rows.Next() {
		var w WaitlistEntry
		if err := rows.Scan(&w.ID, &w.FirstName, &w.LastName, &w.Email, &w.Phone,
			&w.Notes, &w.AdminNotes, &w.USTARanking, &w.Status, &w.Position,
			&w.ApplicationDate, &w.CreatedAt); err != nil {
			continue
		}
		entries = append(entries, w)
	}
	return c.JSON(http.StatusOK, entries)
}

// ListRequests returns pending membership requests (status = new_request).
func (h *WaitlistHandler) ListRequests(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, email, phone, notes, admin_notes,
		        usta_ranking, status,
		        to_char(application_date, 'YYYY-MM-DD'), created_at
		 FROM waitlist
		 WHERE status = 'new_request'
		 ORDER BY created_at ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch requests")
	}
	defer rows.Close()

	entries := []WaitlistEntry{}
	for rows.Next() {
		var w WaitlistEntry
		if err := rows.Scan(&w.ID, &w.FirstName, &w.LastName, &w.Email, &w.Phone,
			&w.Notes, &w.AdminNotes, &w.USTARanking, &w.Status,
			&w.ApplicationDate, &w.CreatedAt); err != nil {
			continue
		}
		entries = append(entries, w)
	}
	return c.JSON(http.StatusOK, entries)
}

// Approve promotes a new_request to pending (official waitlist).
func (h *WaitlistHandler) Approve(c echo.Context) error {
	id := c.Param("id")
	tag, err := h.DB.Exec(c.Request().Context(),
		`UPDATE waitlist
		 SET status = 'pending',
		     application_date = COALESCE(application_date, CURRENT_DATE)
		 WHERE id = $1 AND status = 'new_request'`, id)
	if err != nil || tag.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "request not found or already processed")
	}

	// Send approval confirmation to applicant if we have email + mailer.
	if h.Mailer != nil {
		go h.sendApprovalConfirmation(id)
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "approved"})
}

func (h *WaitlistHandler) sendApprovalConfirmation(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var email, firstName string
	err := h.DB.QueryRow(ctx,
		`SELECT COALESCE(email,''), first_name FROM waitlist WHERE id = $1`, id).Scan(&email, &firstName)
	if err != nil || email == "" {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <p style="color:#1b2d1d">Dear %s,</p>
  <p style="color:#374151;line-height:1.6">
    Great news — your membership application has been reviewed and you have been officially added
    to the Live Oaks Tennis Association waitlist. We will contact you when a membership becomes available.
  </p>
  <p style="color:#374151;line-height:1.6">Thank you for your interest in our club!</p>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">
    Live Oaks Tennis Association — Membership Committee<br>
    South Pasadena, California
  </p>
</div>`, firstName)
	h.Mailer.Send(email, "You're on the Live Oaks Waitlist!", body) //nolint
}

// UpdateStatus changes the status of a waitlist entry.
func (h *WaitlistHandler) UpdateStatus(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	h.DB.Exec(c.Request().Context(), `UPDATE waitlist SET status = $1 WHERE id = $2`, body.Status, id)
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

// UpdateContact updates email, phone, and USTA ranking on a waitlist entry.
func (h *WaitlistHandler) UpdateContact(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Email       string `json:"email"`
		Phone       string `json:"phone"`
		USTARanking string `json:"usta_ranking"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE waitlist SET email = NULLIF($1,''), phone = NULLIF($2,''), usta_ranking = NULLIF($3,'') WHERE id = $4`,
		body.Email, body.Phone, body.USTARanking, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update contact")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

// UpdateAdminNotes sets board-facing notes on any waitlist/request entry.
func (h *WaitlistHandler) UpdateAdminNotes(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		AdminNotes string `json:"admin_notes"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	h.DB.Exec(c.Request().Context(),
		`UPDATE waitlist SET admin_notes = NULLIF($1,'') WHERE id = $2`, body.AdminNotes, id)
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

// SendApplicantEmail sends a custom email from the board to the membership applicant.
func (h *WaitlistHandler) SendApplicantEmail(c echo.Context) error {
	id := c.Param("id")
	var body struct {
		Subject string `json:"subject"`
		Message string `json:"message"`
	}
	if err := c.Bind(&body); err != nil || strings.TrimSpace(body.Subject) == "" || strings.TrimSpace(body.Message) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "subject and message required")
	}

	var email, firstName string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(email,''), first_name FROM waitlist WHERE id = $1`, id).Scan(&email, &firstName)
	if err != nil || email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "applicant has no email address on file")
	}

	if h.Mailer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "email not configured")
	}

	// Preserve line breaks in the message.
	safeMsg := strings.ReplaceAll(strings.TrimSpace(body.Message), "\n", "<br>")
	htmlBody := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <p style="color:#1b2d1d">Dear %s,</p>
  <div style="color:#374151;line-height:1.6">%s</div>
  <p style="color:#6b7280;font-size:12px;margin-top:32px">
    Live Oaks Tennis Association — Membership Committee<br>
    South Pasadena, California
  </p>
</div>`, firstName, safeMsg)

	if err := h.Mailer.Send(email, body.Subject, htmlBody); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to send email: "+err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "sent"})
}

// Delete removes a waitlist entry.
func (h *WaitlistHandler) Delete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM waitlist WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
