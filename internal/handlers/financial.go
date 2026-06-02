package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type FinancialMailer interface {
	Send(to, subject, body string) error
}

type FinancialHandler struct {
	DB      *pgxpool.Pool
	Mailer  FinancialMailer
	SiteURL string
	Logger  interface {
		Log(ctx context.Context, event, details, userID, ip string)
	}
}

// CheckFinancialBlock is called by bookings and kiosk before allowing a transaction.
// action should be "block_bookings" or "block_kiosk".
// Returns nil if no rule blocks the user, or a 402 HTTP error if blocked.
func CheckFinancialBlock(ctx context.Context, db *pgxpool.Pool, userID, action string) error {
	rows, err := db.Query(ctx,
		`SELECT condition, grace_days FROM financial_rules
		 WHERE enabled = true AND $1 = ANY(actions)`, action)
	if err != nil {
		return nil // never block on a DB error
	}
	defer rows.Close()

	type rule struct{ Condition string; GraceDays int }
	var rules []rule
	for rows.Next() {
		var r rule
		rows.Scan(&r.Condition, &r.GraceDays)
		rules = append(rules, r)
	}
	rows.Close()

	for _, r := range rules {
		switch r.Condition {
		case "unpaid_dues":
			var count int
			db.QueryRow(ctx,
				`SELECT COUNT(*) FROM dues
				 WHERE user_id = $1 AND status = 'unpaid'
				 AND due_date <= CURRENT_DATE - ($2 * INTERVAL '1 day')`,
				userID, r.GraceDays).Scan(&count)
			if count > 0 {
				return echo.NewHTTPError(http.StatusPaymentRequired,
					"your account has overdue dues — please contact the office to continue")
			}

		case "any_outstanding_balance":
			var balance float64
			db.QueryRow(ctx, `
				SELECT COALESCE(d.owed,0)
				     + GREATEST(COALESCE(k.charges,0) - COALESCE(kp.paid,0), 0)
				     + COALESCE(mc.owed,0)
				FROM (SELECT 1) _
				LEFT JOIN (
					SELECT SUM(amount) AS owed FROM dues
					WHERE user_id = $1 AND status = 'unpaid'
					AND due_date <= CURRENT_DATE - ($2 * INTERVAL '1 day')
				) d ON true
				LEFT JOIN (SELECT SUM(total) AS charges FROM pro_shop_purchases WHERE user_id = $1) k ON true
				LEFT JOIN (SELECT SUM(amount) AS paid FROM kiosk_payments WHERE user_id = $1) kp ON true
				LEFT JOIN (
					SELECT SUM(amount) AS owed FROM member_charges
					WHERE user_id = $1 AND status = 'unpaid'
					AND charge_date <= CURRENT_DATE - ($2 * INTERVAL '1 day')
				) mc ON true`,
				userID, r.GraceDays).Scan(&balance)
			if balance > 0 {
				return echo.NewHTTPError(http.StatusPaymentRequired,
					"your account has an outstanding balance — please contact the office to continue")
			}
		}
	}
	return nil
}

// ── Rules ─────────────────────────────────────────────────────────────────

func (h *FinancialHandler) ListRules(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, name, enabled, condition, grace_days, actions, created_at, updated_at
		 FROM financial_rules ORDER BY created_at`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch rules")
	}
	defer rows.Close()

	type Rule struct {
		ID        string    `json:"id"`
		Name      string    `json:"name"`
		Enabled   bool      `json:"enabled"`
		Condition string    `json:"condition"`
		GraceDays int       `json:"grace_days"`
		Actions   []string  `json:"actions"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	result := []Rule{}
	for rows.Next() {
		var r Rule
		if err := rows.Scan(&r.ID, &r.Name, &r.Enabled, &r.Condition, &r.GraceDays, &r.Actions, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		result = append(result, r)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *FinancialHandler) CreateRule(c echo.Context) error {
	var req struct {
		Name      string   `json:"name"`
		Condition string   `json:"condition"`
		GraceDays int      `json:"grace_days"`
		Actions   []string `json:"actions"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.Condition == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and condition required")
	}
	if req.Condition != "unpaid_dues" && req.Condition != "any_outstanding_balance" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid condition")
	}
	if req.GraceDays < 0 {
		req.GraceDays = 0
	}
	if req.Actions == nil {
		req.Actions = []string{}
	}
	var id string
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO financial_rules (name, condition, grace_days, actions)
		 VALUES ($1,$2,$3,$4) RETURNING id`,
		req.Name, req.Condition, req.GraceDays, req.Actions).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create rule")
	}
	adminID := c.Get("user_id").(string)
	h.Logger.Log(c.Request().Context(), "financial_rule_created", req.Name, adminID, c.RealIP())
	return c.JSON(http.StatusCreated, map[string]string{"id": id})
}

func (h *FinancialHandler) UpdateRule(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name      string   `json:"name"`
		Enabled   bool     `json:"enabled"`
		Condition string   `json:"condition"`
		GraceDays int      `json:"grace_days"`
		Actions   []string `json:"actions"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Condition != "unpaid_dues" && req.Condition != "any_outstanding_balance" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid condition")
	}
	if req.Actions == nil {
		req.Actions = []string{}
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE financial_rules SET name=$1, enabled=$2, condition=$3, grace_days=$4, actions=$5, updated_at=NOW()
		 WHERE id=$6`,
		req.Name, req.Enabled, req.Condition, req.GraceDays, req.Actions, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update rule")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *FinancialHandler) DeleteRule(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM financial_rules WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}

// ── Member Balances ────────────────────────────────────────────────────────

type memberBalance struct {
	UserID      string   `json:"user_id"`
	FirstName   string   `json:"first_name"`
	LastName    string   `json:"last_name"`
	Email       string   `json:"email"`
	DuesOwed    float64  `json:"dues_owed"`
	KioskTab    float64  `json:"kiosk_tab"`
	ChargesOwed float64  `json:"charges_owed"`
	Total       float64  `json:"total"`
	OldestDue   *string  `json:"oldest_due"`
}

func (h *FinancialHandler) MemberBalances(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT * FROM (
			SELECT
				u.id, u.first_name, u.last_name, u.email,
				COALESCE(d.dues_owed, 0)::float8 AS dues_owed,
				GREATEST(COALESCE(k.kiosk_charges, 0) - COALESCE(kp.kiosk_paid, 0), 0)::float8 AS kiosk_tab,
				COALESCE(mc.charges_owed, 0)::float8 AS charges_owed,
				d.oldest_due::text
			FROM users u
			LEFT JOIN (
				SELECT user_id, SUM(amount) AS dues_owed, MIN(due_date)::text AS oldest_due
				FROM dues WHERE status = 'unpaid' GROUP BY user_id
			) d ON d.user_id = u.id
			LEFT JOIN (
				SELECT user_id, SUM(total) AS kiosk_charges
				FROM pro_shop_purchases GROUP BY user_id
			) k ON k.user_id = u.id
			LEFT JOIN (
				SELECT user_id, SUM(amount) AS kiosk_paid
				FROM kiosk_payments GROUP BY user_id
			) kp ON kp.user_id = u.id
			LEFT JOIN (
				SELECT user_id, SUM(amount) AS charges_owed
				FROM member_charges WHERE status = 'unpaid' GROUP BY user_id
			) mc ON mc.user_id = u.id
			WHERE u.status = 'active'
		) t
		WHERE dues_owed + kiosk_tab + charges_owed > 0
		ORDER BY dues_owed + kiosk_tab + charges_owed DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch balances")
	}
	defer rows.Close()

	result := []memberBalance{}
	for rows.Next() {
		var b memberBalance
		if err := rows.Scan(&b.UserID, &b.FirstName, &b.LastName, &b.Email,
			&b.DuesOwed, &b.KioskTab, &b.ChargesOwed, &b.OldestDue); err != nil {
			continue
		}
		b.Total = b.DuesOwed + b.KioskTab + b.ChargesOwed
		result = append(result, b)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *FinancialHandler) MemberStatement(c echo.Context) error {
	userID := c.Param("id")

	type Entry struct {
		Date        string  `json:"date"`
		Category    string  `json:"category"`
		Description string  `json:"description"`
		Amount      float64 `json:"amount"`
		Status      string  `json:"status"`
		ID          string  `json:"id"`
	}

	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT date, category, description, amount, status, id FROM (
			-- Dues
			SELECT due_date::text AS date, 'dues' AS category,
			       'Annual Dues' AS description,
			       amount::float8, status, id::text
			FROM dues WHERE user_id = $1

			UNION ALL

			-- Kiosk purchases
			SELECT created_at::date::text, 'kiosk',
			       item_name || CASE WHEN quantity > 1 THEN ' x' || quantity ELSE '' END,
			       total::float8, 'charged', id::text
			FROM pro_shop_purchases WHERE user_id = $1

			UNION ALL

			-- Kiosk payments
			SELECT created_at::date::text, 'kiosk_payment',
			       'Kiosk Tab Payment' || COALESCE(': ' || notes, ''),
			       amount::float8, 'paid', id::text
			FROM kiosk_payments WHERE user_id = $1

			UNION ALL

			-- Misc charges
			SELECT charge_date::text, 'charge',
			       description, amount::float8, status, id::text
			FROM member_charges WHERE user_id = $1
		) t
		ORDER BY date DESC, category`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch statement")
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.Date, &e.Category, &e.Description, &e.Amount, &e.Status, &e.ID); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return c.JSON(http.StatusOK, entries)
}

// MyBalance returns the current member's outstanding balance for the dashboard warning.
func (h *FinancialHandler) MyBalance(c echo.Context) error {
	userID := c.Get("user_id").(string)

	var duesOwed, kioskCharges, kioskPaid, chargesOwed float64
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(amount),0) FROM dues WHERE user_id=$1 AND status='unpaid'`, userID).Scan(&duesOwed)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(total),0) FROM pro_shop_purchases WHERE user_id=$1`, userID).Scan(&kioskCharges)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(amount),0) FROM kiosk_payments WHERE user_id=$1`, userID).Scan(&kioskPaid)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(amount),0) FROM member_charges WHERE user_id=$1 AND status='unpaid'`, userID).Scan(&chargesOwed)

	kioskTab := kioskCharges - kioskPaid
	if kioskTab < 0 {
		kioskTab = 0
	}
	total := duesOwed + kioskTab + chargesOwed

	return c.JSON(http.StatusOK, map[string]interface{}{
		"dues_owed":    duesOwed,
		"kiosk_tab":   kioskTab,
		"charges_owed": chargesOwed,
		"total":        total,
	})
}

// ── Charges ────────────────────────────────────────────────────────────────

func (h *FinancialHandler) CreateCharge(c echo.Context) error {
	var req struct {
		UserID      string  `json:"user_id"`
		Description string  `json:"description"`
		Amount      float64 `json:"amount"`
		ChargeDate  string  `json:"charge_date"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Description == "" || req.Amount <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id, description, and amount > 0 required")
	}
	if req.ChargeDate == "" {
		req.ChargeDate = time.Now().Format("2006-01-02")
	}
	adminID := c.Get("user_id").(string)
	var id string
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO member_charges (user_id, description, amount, charge_date, created_by)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		req.UserID, req.Description, req.Amount, req.ChargeDate, adminID).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create charge")
	}
	h.Logger.Log(c.Request().Context(), "charge_created",
		fmt.Sprintf("$%.2f — %s", req.Amount, req.Description), adminID, c.RealIP())
	return c.JSON(http.StatusCreated, map[string]string{"id": id})
}

func (h *FinancialHandler) UpdateChargeStatus(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Status string `json:"status"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Status != "unpaid" && req.Status != "paid" && req.Status != "waived" {
		return echo.NewHTTPError(http.StatusBadRequest, "status must be unpaid, paid, or waived")
	}
	paidAt := "NULL"
	if req.Status == "paid" {
		paidAt = "NOW()"
	}
	_, err := h.DB.Exec(c.Request().Context(),
		fmt.Sprintf(`UPDATE member_charges SET status=$1, paid_at=%s WHERE id=$2`, paidAt),
		req.Status, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update charge")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "updated"})
}

func (h *FinancialHandler) DeleteCharge(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM member_charges WHERE id=$1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// ── Kiosk Payments ─────────────────────────────────────────────────────────

func (h *FinancialHandler) RecordKioskPayment(c echo.Context) error {
	var req struct {
		UserID string  `json:"user_id"`
		Amount float64 `json:"amount"`
		Notes  string  `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Amount <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and amount > 0 required")
	}
	adminID := c.Get("user_id").(string)
	var id string
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO kiosk_payments (user_id, amount, notes, recorded_by)
		 VALUES ($1,$2,NULLIF($3,''),$4) RETURNING id`,
		req.UserID, req.Amount, req.Notes, adminID).Scan(&id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not record payment")
	}
	h.Logger.Log(c.Request().Context(), "kiosk_payment_recorded",
		fmt.Sprintf("$%.2f for user %s", req.Amount, req.UserID), adminID, c.RealIP())
	return c.JSON(http.StatusCreated, map[string]string{"id": id})
}

func (h *FinancialHandler) DeleteKioskPayment(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM kiosk_payments WHERE id=$1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// ── P&L Report ─────────────────────────────────────────────────────────────

func (h *FinancialHandler) PLReport(c echo.Context) error {
	yearStr := c.QueryParam("year")
	year := time.Now().Year()
	if y, err := strconv.Atoi(yearStr); err == nil && y > 2000 {
		year = y
	}

	type MonthRow struct {
		Month      string  `json:"month"`
		Label      string  `json:"label"`
		Dues       float64 `json:"dues"`
		KioskSales float64 `json:"kiosk_sales"`
		Charges    float64 `json:"charges"`
		GuestFees  float64 `json:"guest_fees"`
		Income     float64 `json:"income"`
		Expenses   float64 `json:"expenses"`
		Net        float64 `json:"net"`
	}

	months := make(map[string]*MonthRow)
	monthLabels := []string{"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"}
	var orderedKeys []string
	for m := 1; m <= 12; m++ {
		key := fmt.Sprintf("%04d-%02d", year, m)
		months[key] = &MonthRow{Month: key, Label: monthLabels[m-1]}
		orderedKeys = append(orderedKeys, key)
	}

	collect := func(query string, args []interface{}, setField func(row *MonthRow, val float64)) {
		rows, err := h.DB.Query(c.Request().Context(), query, args...)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var monthStr string
			var val float64
			if err := rows.Scan(&monthStr, &val); err != nil {
				continue
			}
			if row, ok := months[monthStr]; ok {
				setField(row, val)
			}
		}
	}

	// Dues paid
	collect(`SELECT TO_CHAR(DATE_TRUNC('month', paid_at), 'YYYY-MM'), SUM(amount)::float8
		FROM dues WHERE status='paid' AND paid_at IS NOT NULL AND EXTRACT(YEAR FROM paid_at)=$1
		GROUP BY 1`, []interface{}{year},
		func(r *MonthRow, v float64) { r.Dues = v })

	// Kiosk sales
	collect(`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM'), SUM(total)::float8
		FROM pro_shop_purchases WHERE EXTRACT(YEAR FROM created_at)=$1
		GROUP BY 1`, []interface{}{year},
		func(r *MonthRow, v float64) { r.KioskSales = v })

	// Misc charges collected
	collect(`SELECT TO_CHAR(DATE_TRUNC('month', paid_at), 'YYYY-MM'), SUM(amount)::float8
		FROM member_charges WHERE status='paid' AND paid_at IS NOT NULL AND EXTRACT(YEAR FROM paid_at)=$1
		GROUP BY 1`, []interface{}{year},
		func(r *MonthRow, v float64) { r.Charges = v })

	// Guest fees
	collect(`SELECT TO_CHAR(DATE_TRUNC('month', visit_date::timestamptz), 'YYYY-MM'), SUM(fee)::float8
		FROM guest_passes WHERE fee > 0 AND EXTRACT(YEAR FROM visit_date)=$1
		GROUP BY 1`, []interface{}{year},
		func(r *MonthRow, v float64) { r.GuestFees = v })

	// Expenses (receipts)
	collect(`SELECT TO_CHAR(DATE_TRUNC('month', receipt_date::timestamptz), 'YYYY-MM'), SUM(amount)::float8
		FROM billing_receipts WHERE amount IS NOT NULL AND EXTRACT(YEAR FROM receipt_date)=$1
		GROUP BY 1`, []interface{}{year},
		func(r *MonthRow, v float64) { r.Expenses = v })

	// Compute income and net
	var result []MonthRow
	totals := MonthRow{Month: "total", Label: "Year Total"}
	for _, k := range orderedKeys {
		row := months[k]
		row.Income = row.Dues + row.KioskSales + row.Charges + row.GuestFees
		row.Net = row.Income - row.Expenses
		result = append(result, *row)
		totals.Dues += row.Dues
		totals.KioskSales += row.KioskSales
		totals.Charges += row.Charges
		totals.GuestFees += row.GuestFees
		totals.Income += row.Income
		totals.Expenses += row.Expenses
		totals.Net += row.Net
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"year":   year,
		"months": result,
		"totals": totals,
	})
}

// ── Email Reminders ────────────────────────────────────────────────────────

func (h *FinancialHandler) SendReminders(c echo.Context) error {
	// Find all active members with unpaid dues overdue per any email_reminder rule
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT DISTINCT u.id, u.first_name, u.email,
		       SUM(d.amount) OVER (PARTITION BY u.id)::float8 AS dues_owed
		FROM users u
		JOIN dues d ON d.user_id = u.id
		JOIN financial_rules fr ON fr.enabled = true
		    AND 'email_reminder' = ANY(fr.actions)
		    AND fr.condition = 'unpaid_dues'
		    AND d.due_date <= CURRENT_DATE - (fr.grace_days * INTERVAL '1 day')
		WHERE u.status = 'active'
		  AND d.status = 'unpaid'`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch overdue members")
	}
	defer rows.Close()

	type recipient struct {
		ID        string
		FirstName string
		Email     string
		DuesOwed  float64
	}
	var recipients []recipient
	for rows.Next() {
		var r recipient
		if err := rows.Scan(&r.ID, &r.FirstName, &r.Email, &r.DuesOwed); err != nil {
			continue
		}
		recipients = append(recipients, r)
	}
	rows.Close()

	sent, failed := 0, 0
	adminID := c.Get("user_id").(string)
	for _, r := range recipients {
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Liveoaks Tennis Club — Account Reminder</h2>
  <p>Hi %s,</p>
  <p>This is a friendly reminder that your account has an outstanding balance of
     <strong>$%.2f</strong> in unpaid dues.</p>
  <p>Please contact the club office to settle your balance and keep your membership active.
     Members with overdue balances may be restricted from making court reservations.</p>
  <p>If you believe this is an error or have already made a payment, please disregard this message
     or reach out so we can update your account.</p>
  <p>Thank you for being a Liveoaks member!</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">Liveoaks Tennis Club</p>
</div>`, r.FirstName, r.DuesOwed)

		if err := h.Mailer.Send(r.Email, "Liveoaks Tennis Club — Dues Reminder", body); err != nil {
			failed++
			h.Logger.Log(c.Request().Context(), "email_error",
				"dues reminder to "+r.Email+": "+err.Error(), adminID, c.RealIP())
		} else {
			sent++
			h.Logger.Log(c.Request().Context(), "dues_reminder_sent",
				"to "+r.Email, adminID, c.RealIP())
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"sent":   sent,
		"failed": failed,
		"total":  len(recipients),
	})
}
