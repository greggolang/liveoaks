package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type CourtBlocksHandler struct {
	DB *pgxpool.Pool
}

type CourtBlock struct {
	ID           string     `json:"id"`
	CourtID      *int       `json:"court_id"`
	Reason       string     `json:"reason"`
	BlockType    string     `json:"block_type"`
	DayOfWeek    *int       `json:"day_of_week"`
	StartTime    *string    `json:"start_time"`
	EndTime      *string    `json:"end_time"`
	OneTimeStart *time.Time `json:"one_time_start"`
	OneTimeEnd   *time.Time `json:"one_time_end"`
	Active       bool       `json:"active"`
	CreatedAt    time.Time  `json:"created_at"`
}

func scanBlock(row interface {
	Scan(...any) error
}, b *CourtBlock) error {
	return row.Scan(
		&b.ID, &b.CourtID, &b.Reason, &b.BlockType, &b.DayOfWeek,
		&b.StartTime, &b.EndTime, &b.OneTimeStart, &b.OneTimeEnd,
		&b.Active, &b.CreatedAt,
	)
}

const blockSelectCols = `id, court_id, reason, block_type, day_of_week,
    start_time::text, end_time::text, one_time_start, one_time_end, active, created_at`

// ListAdmin returns all blocks (board+ only).
func (h *CourtBlocksHandler) ListAdmin(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT `+blockSelectCols+` FROM court_blocks ORDER BY created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list blocks")
	}
	defer rows.Close()
	blocks := []CourtBlock{}
	for rows.Next() {
		var b CourtBlock
		if scanBlock(rows, &b) == nil {
			blocks = append(blocks, b)
		}
	}
	return c.JSON(http.StatusOK, blocks)
}

// ListForDate returns active blocks that apply to the given date (authenticated members).
func (h *CourtBlocksHandler) ListForDate(c echo.Context) error {
	loc := loadTimezone(c.Request().Context(), h.DB)
	var t time.Time
	if date := c.QueryParam("date"); date != "" {
		parsed, err := time.ParseInLocation("2006-01-02", date, loc)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid date")
		}
		t = parsed
	} else {
		n := time.Now().In(loc)
		t = time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
	}
	dow := int(t.Weekday())
	dayStart := t.UTC()
	dayEnd := t.Add(24 * time.Hour).UTC()

	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT `+blockSelectCols+` FROM court_blocks
         WHERE active = true
         AND (
             (block_type = 'recurring_weekly' AND day_of_week = $1)
             OR
             (block_type = 'one_time' AND one_time_start < $2 AND one_time_end > $3)
         )
         ORDER BY COALESCE(start_time, '00:00:00'::time)`,
		dow, dayEnd, dayStart)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not list blocks")
	}
	defer rows.Close()
	blocks := []CourtBlock{}
	for rows.Next() {
		var b CourtBlock
		if scanBlock(rows, &b) == nil {
			blocks = append(blocks, b)
		}
	}
	return c.JSON(http.StatusOK, blocks)
}

// Create adds a new court block (board+ only).
func (h *CourtBlocksHandler) Create(c echo.Context) error {
	var req struct {
		CourtID      *int    `json:"court_id"`
		Reason       string  `json:"reason"`
		BlockType    string  `json:"block_type"`
		DayOfWeek    *int    `json:"day_of_week"`
		StartTime    *string `json:"start_time"`
		EndTime      *string `json:"end_time"`
		OneTimeStart *string `json:"one_time_start"`
		OneTimeEnd   *string `json:"one_time_end"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Reason == "" {
		req.Reason = "Court Washing"
	}
	if req.BlockType == "" {
		req.BlockType = "recurring_weekly"
	}

	if req.BlockType == "recurring_weekly" {
		if req.DayOfWeek == nil || req.StartTime == nil || req.EndTime == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "day_of_week, start_time, and end_time are required")
		}
	} else {
		if req.OneTimeStart == nil || req.OneTimeEnd == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "one_time_start and one_time_end are required")
		}
	}

	userID := c.Get("user_id").(string)
	var b CourtBlock
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO court_blocks
             (court_id, reason, block_type, day_of_week, start_time, end_time, one_time_start, one_time_end, created_by)
         VALUES ($1, $2, $3, $4, $5::TIME, $6::TIME, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ, $9)
         RETURNING `+blockSelectCols,
		req.CourtID, req.Reason, req.BlockType, req.DayOfWeek,
		req.StartTime, req.EndTime, req.OneTimeStart, req.OneTimeEnd, userID,
	).Scan(&b.ID, &b.CourtID, &b.Reason, &b.BlockType, &b.DayOfWeek,
		&b.StartTime, &b.EndTime, &b.OneTimeStart, &b.OneTimeEnd, &b.Active, &b.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create block")
	}
	return c.JSON(http.StatusCreated, b)
}

// Delete removes a court block (board+ only).
func (h *CourtBlocksHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	h.DB.Exec(c.Request().Context(), `DELETE FROM court_blocks WHERE id = $1`, id)
	return c.NoContent(http.StatusNoContent)
}

// checkCourtBlocks returns an HTTP error if a booking conflicts with any active maintenance block.
func checkCourtBlocks(ctx context.Context, db *pgxpool.Pool, courtID int, start, end time.Time, loc *time.Location) error {
	localStart := start.In(loc)
	localEnd := end.In(loc)
	dow := int(localStart.Weekday())
	startStr := localStart.Format("15:04:05")
	endStr := localEnd.Format("15:04:05")

	var count int
	db.QueryRow(ctx, `
        SELECT COUNT(*) FROM court_blocks
        WHERE active = true
        AND (court_id IS NULL OR court_id = $1)
        AND (
            (block_type = 'recurring_weekly'
             AND day_of_week = $2
             AND start_time < $3::TIME
             AND end_time > $4::TIME)
            OR
            (block_type = 'one_time'
             AND one_time_start < $5
             AND one_time_end > $6)
        )`,
		courtID, dow, endStr, startStr, end, start).Scan(&count)
	if count > 0 {
		return echo.NewHTTPError(http.StatusConflict,
			"this time is blocked for court maintenance — please choose another time")
	}
	return nil
}
