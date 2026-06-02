package notifprefs

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Valid pref keys — matches columns in user_notification_prefs.
var valid = map[string]bool{
	"booking_confirmation": true,
	"match_invitation":     true,
	"booking_reminder":     true,
	"announcement":         true,
	"broadcast":            true,
	"event_notification":   true,
	"board_meeting":        true,
	"ladder_challenge":     true,
	"liveball_invitation":  true,
	"member_message":       true,
	"court_waitlist":       true,
}

// UserWantsEmail returns true if the user has the given notification type enabled.
// Returns true (opt-in by default) when no preference row exists for the user.
func UserWantsEmail(ctx context.Context, db *pgxpool.Pool, userID, pref string) bool {
	if !valid[pref] {
		return true
	}
	var wants bool
	err := db.QueryRow(ctx,
		// COALESCE returns true when the user has no row (default opt-in)
		`SELECT COALESCE((SELECT `+pref+` FROM user_notification_prefs WHERE user_id = $1), true)`,
		userID,
	).Scan(&wants)
	return err == nil && wants
}
