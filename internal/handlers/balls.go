package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type BallsHandler struct {
	DB *pgxpool.Pool
}

type BallPurchase struct {
	ID           string     `json:"id"`
	PurchaseDate string     `json:"purchase_date"`
	Quantity     int        `json:"quantity"`
	CostPerCan   *float64   `json:"cost_per_can,omitempty"`
	TotalCost    *float64   `json:"total_cost,omitempty"`
	Notes        *string    `json:"notes,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type BallUsageEvent struct {
	ID        string  `json:"id"`
	UsedDate  string  `json:"used_date"`
	Quantity  int     `json:"quantity"`
	Source    string  `json:"source"`
	UserName  *string `json:"user_name,omitempty"`
	CourtName *string `json:"court_name,omitempty"`
	Notes     *string `json:"notes,omitempty"`
}

type BallPeriodReport struct {
	From               string  `json:"from"`
	To                 string  `json:"to"`
	BeginningInventory int     `json:"beginning_inventory"`
	Purchased          int     `json:"purchased"`
	UsedBookings       int     `json:"used_bookings"`
	UsedProShop        int     `json:"used_pro_shop"`
	UsedOther          int     `json:"used_other"`
	TotalUsed          int     `json:"total_used"`
	EndingInventory    int     `json:"ending_inventory"`
	PeriodCost         float64 `json:"period_cost"`
	BookingCount       int     `json:"booking_count"`
	CostPerBooking     float64 `json:"cost_per_booking"`
	// All-time totals
	AllTimePurchased int     `json:"all_time_purchased"`
	AllTimeUsed      int     `json:"all_time_used"`
	OnHand           int     `json:"on_hand"`
	AllTimeCost      float64 `json:"all_time_cost"`
}

// Summary returns inventory stats + period report.
func (h *BallsHandler) Summary(c echo.Context) error {
	from := c.QueryParam("from")
	to := c.QueryParam("to")
	if from == "" {
		from = time.Now().Format("2006-01-") + "01"
	}
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}

	var r BallPeriodReport
	r.From = from
	r.To = to

	// All-time totals
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(COALESCE(total_cost,0)),0) FROM ball_purchases`).
		Scan(&r.AllTimePurchased, &r.AllTimeCost)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0) FROM ball_usage`).Scan(&r.AllTimeUsed)
	r.OnHand = r.AllTimePurchased - r.AllTimeUsed

	// Beginning inventory (everything strictly before the period)
	var purchasedBefore, usedBefore int
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0) FROM ball_purchases WHERE purchase_date < $1`, from).Scan(&purchasedBefore)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0) FROM ball_usage WHERE used_date < $1`, from).Scan(&usedBefore)
	r.BeginningInventory = purchasedBefore - usedBefore

	// Period stats
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(COALESCE(total_cost,0)),0)
		 FROM ball_purchases WHERE purchase_date BETWEEN $1 AND $2`, from, to).
		Scan(&r.Purchased, &r.PeriodCost)

	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0) FROM ball_usage WHERE source='booking' AND used_date BETWEEN $1 AND $2`, from, to).
		Scan(&r.UsedBookings)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0) FROM ball_usage WHERE source='pro_shop' AND used_date BETWEEN $1 AND $2`, from, to).
		Scan(&r.UsedProShop)
	h.DB.QueryRow(c.Request().Context(),
		`SELECT COALESCE(SUM(quantity),0) FROM ball_usage WHERE source='manual' AND used_date BETWEEN $1 AND $2`, from, to).
		Scan(&r.UsedOther)

	r.TotalUsed = r.UsedBookings + r.UsedProShop + r.UsedOther
	r.EndingInventory = r.BeginningInventory + r.Purchased - r.TotalUsed
	r.BookingCount = r.UsedBookings
	if r.BookingCount > 0 && r.PeriodCost > 0 {
		r.CostPerBooking = r.PeriodCost / float64(r.BookingCount)
	}

	return c.JSON(http.StatusOK, r)
}

// UsageList returns individual usage events for a period.
func (h *BallsHandler) UsageList(c echo.Context) error {
	from := c.QueryParam("from")
	to := c.QueryParam("to")
	if from == "" { from = "2000-01-01" }
	if to == "" { to = time.Now().Format("2006-01-02") }

	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, to_char(used_date,'YYYY-MM-DD'), quantity, source, user_name, court_name, notes
		FROM ball_usage
		WHERE used_date BETWEEN $1 AND $2
		ORDER BY used_date DESC, created_at DESC`, from, to)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch usage")
	}
	defer rows.Close()
	events := []BallUsageEvent{}
	for rows.Next() {
		var e BallUsageEvent
		rows.Scan(&e.ID, &e.UsedDate, &e.Quantity, &e.Source, &e.UserName, &e.CourtName, &e.Notes)
		events = append(events, e)
	}
	return c.JSON(http.StatusOK, events)
}

// DeleteUsage removes a usage record.
func (h *BallsHandler) DeleteUsage(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM ball_usage WHERE id=$1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// PurchaseList returns all purchases.
func (h *BallsHandler) PurchaseList(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, to_char(purchase_date,'YYYY-MM-DD'), quantity, cost_per_can, total_cost, notes, created_at
		FROM ball_purchases ORDER BY purchase_date DESC, created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch purchases")
	}
	defer rows.Close()
	purchases := []BallPurchase{}
	for rows.Next() {
		var p BallPurchase
		rows.Scan(&p.ID, &p.PurchaseDate, &p.Quantity, &p.CostPerCan, &p.TotalCost, &p.Notes, &p.CreatedAt)
		purchases = append(purchases, p)
	}
	return c.JSON(http.StatusOK, purchases)
}

// RecordPurchase adds a new ball purchase.
func (h *BallsHandler) RecordPurchase(c echo.Context) error {
	adminID := c.Get("user_id").(string)
	var req struct {
		PurchaseDate string   `json:"purchase_date"`
		Quantity     int      `json:"quantity"`
		CostPerCan   *float64 `json:"cost_per_can"`
		TotalCost    *float64 `json:"total_cost"`
		Notes        string   `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.Quantity <= 0 || req.PurchaseDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "purchase_date and quantity required")
	}
	// Auto-calculate total if only per-can given, and vice versa
	if req.CostPerCan != nil && req.TotalCost == nil {
		t := *req.CostPerCan * float64(req.Quantity)
		req.TotalCost = &t
	} else if req.TotalCost != nil && req.CostPerCan == nil {
		t := *req.TotalCost / float64(req.Quantity)
		req.CostPerCan = &t
	}
	var p BallPurchase
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO ball_purchases (purchase_date, quantity, cost_per_can, total_cost, notes, created_by)
		VALUES ($1, $2, $3, $4, NULLIF($5,''), $6)
		RETURNING id, to_char(purchase_date,'YYYY-MM-DD'), quantity, cost_per_can, total_cost, notes, created_at`,
		req.PurchaseDate, req.Quantity, req.CostPerCan, req.TotalCost, req.Notes, adminID,
	).Scan(&p.ID, &p.PurchaseDate, &p.Quantity, &p.CostPerCan, &p.TotalCost, &p.Notes, &p.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not record purchase")
	}
	return c.JSON(http.StatusCreated, p)
}

// DeletePurchase removes a purchase record.
func (h *BallsHandler) DeletePurchase(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM ball_purchases WHERE id=$1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}

// RecordManualUsage records a Pro Shop sale or other manual usage.
func (h *BallsHandler) RecordManualUsage(c echo.Context) error {
	var req struct {
		UsedDate string `json:"used_date"`
		Quantity int    `json:"quantity"`
		Source   string `json:"source"` // pro_shop | manual
		Notes    string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil || req.Quantity <= 0 || req.UsedDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "used_date and quantity required")
	}
	if req.Source != "pro_shop" && req.Source != "manual" {
		req.Source = "manual"
	}
	var e BallUsageEvent
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO ball_usage (used_date, quantity, source, notes)
		VALUES ($1, $2, $3, NULLIF($4,''))
		RETURNING id, to_char(used_date,'YYYY-MM-DD'), quantity, source, user_name, court_name, notes`,
		req.UsedDate, req.Quantity, req.Source, req.Notes,
	).Scan(&e.ID, &e.UsedDate, &e.Quantity, &e.Source, &e.UserName, &e.CourtName, &e.Notes)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not record usage")
	}
	return c.JSON(http.StatusCreated, e)
}
