package handlers

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// loadTimezone reads the 'timezone' setting from the DB and returns the matching location.
// Falls back to America/Los_Angeles if the setting is missing or invalid.
func loadTimezone(ctx context.Context, db *pgxpool.Pool) *time.Location {
	var tz string
	db.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'timezone'`).Scan(&tz)
	if tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			return loc
		}
	}
	if loc, err := time.LoadLocation("America/Los_Angeles"); err == nil {
		return loc
	}
	return time.UTC
}
