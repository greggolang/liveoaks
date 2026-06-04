package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/greggolang/liveoaks/internal/ai"
	"github.com/jackc/pgx/v5/pgxpool"
)

// courtHours returns the club's open/close hours (24h) from settings, defaulting
// to 8 AM–8 PM. Used by both the assistant and the real booking validation so
// they always agree.
func courtHours(ctx context.Context, db *pgxpool.Pool) (open, close int) {
	open, close = 8, 20
	var o, c string
	db.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'court_open_hour'`).Scan(&o)
	db.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'court_close_hour'`).Scan(&c)
	if n, err := strconv.Atoi(strings.TrimSpace(o)); err == nil && n >= 0 && n < 24 {
		open = n
	}
	if n, err := strconv.Atoi(strings.TrimSpace(c)); err == nil && n > open && n <= 24 {
		close = n
	}
	return open, close
}

// fmtHour formats a 24h hour as "8:00 AM" / "8:00 PM".
func fmtHour(h int) string {
	suffix, hh := "AM", h
	if h >= 12 {
		suffix = "PM"
		if h > 12 {
			hh = h - 12
		}
	}
	if h == 0 {
		hh = 12
	}
	return fmt.Sprintf("%d:00 %s", hh, suffix)
}

// checkBookingLimits mirrors the main per-member limits enforced by the real
// booking endpoint, so the assistant can warn before proposing instead of after
// the member taps Confirm. Returns a friendly message, or "" if the slot is fine.
// The confirm step remains authoritative.
func (h *AIHandler) checkBookingLimits(ctx context.Context, userID string, startLocal, endLocal time.Time, loc *time.Location) string {
	getInt := func(key string) int {
		var v string
		h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = $1`, key).Scan(&v)
		n, _ := strconv.Atoi(strings.TrimSpace(v))
		return n
	}

	if maxDays := getInt("booking_max_days_ahead"); maxDays > 0 {
		now := time.Now().In(loc)
		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		deadline := todayStart.AddDate(0, 0, maxDays+1)
		if !startLocal.Before(deadline) {
			return fmt.Sprintf("That's further ahead than the %d-day booking window allows.", maxDays)
		}
	}

	var overlap int
	h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time < $2 AND end_time > $3`,
		userID, endLocal.UTC(), startLocal.UTC()).Scan(&overlap)
	if overlap > 0 {
		return "You already have a booking that overlaps that time."
	}

	if maxDay := getInt("booking_max_per_day"); maxDay > 0 {
		dayStart := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), 0, 0, 0, 0, loc).UTC()
		var n int
		h.DB.QueryRow(ctx,
			`SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND start_time >= $2 AND start_time < $3`,
			userID, dayStart, dayStart.Add(24*time.Hour)).Scan(&n)
		if n >= maxDay {
			if maxDay == 1 {
				return "You already have a booking that day (the limit is one per day)."
			}
			return fmt.Sprintf("You've reached the daily limit of %d bookings for that day.", maxDay)
		}
	}

	for _, key := range []string{"booking_max_per_week", "booking_max_courts_per_week"} {
		if maxWk := getInt(key); maxWk > 0 {
			var n int
			h.DB.QueryRow(ctx, `
				SELECT COUNT(*) FROM bookings WHERE user_id = $1
				AND DATE_TRUNC('week', start_time AT TIME ZONE 'America/Los_Angeles')
				  = DATE_TRUNC('week', $2 AT TIME ZONE 'America/Los_Angeles')`,
				userID, startLocal.UTC()).Scan(&n)
			if n >= maxWk {
				return fmt.Sprintf("You've reached your weekly limit of %d reservations.", maxWk)
			}
		}
	}
	return ""
}

// bookingProposal is a not-yet-booked court the assistant found for a member.
// The chat surfaces a Confirm button that books it via the real, fully-validated
// /bookings endpoint — the assistant never writes bookings directly.
type bookingProposal struct {
	CourtID       int               `json:"court_id"`
	CourtName     string            `json:"court_name"`
	StartTime     string            `json:"start_time"` // RFC3339, for api.bookings.create
	EndTime       string            `json:"end_time"`
	MatchType     string            `json:"match_type"`
	PlayersNeeded int               `json:"players_needed"` // roster capacity for the match type
	Invitees      []proposalInvitee `json:"invitees"`
	Label         string            `json:"label"`
}

// proposalInvitee is a player the member asked to invite. Members are resolved
// to a user_id; anyone not matched is carried as a guest by name.
type proposalInvitee struct {
	UserID  string `json:"user_id"` // empty for a guest
	Name    string `json:"name"`
	Email   string `json:"email"`
	IsGuest bool   `json:"is_guest"`
}

// playersForMatch is the roster capacity (excluding the host) for a match type,
// mirroring PLAYERS_BY_TYPE in the booking UI.
func playersForMatch(mt string) int {
	switch mt {
	case "doubles":
		return 3
	case "singles", "casual":
		return 1
	}
	return 1
}

// resolveInvitees turns the names the member gave into invitees: a confident
// name match becomes a member invite; anything ambiguous or unknown is kept as
// a guest by name (the member can fix it from My Bookings before/after).
func (h *AIHandler) resolveInvitees(ctx context.Context, names []string, hostID string) []proposalInvitee {
	out := []proposalInvitee{}
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		rows, err := h.DB.Query(ctx, `
			SELECT id::text, first_name || ' ' || last_name, COALESCE(email, '')
			FROM users
			WHERE status = 'active' AND id <> $2
			  AND (lower(first_name || ' ' || last_name) = lower($1) OR lower(first_name) = lower($1))
			LIMIT 3`, name, hostID)
		if err != nil {
			out = append(out, proposalInvitee{Name: name, IsGuest: true})
			continue
		}
		type cand struct{ id, name, email string }
		var matches []cand
		for rows.Next() {
			var c cand
			if rows.Scan(&c.id, &c.name, &c.email) == nil {
				matches = append(matches, c)
			}
		}
		rows.Close()
		if len(matches) == 1 { // unambiguous member
			out = append(out, proposalInvitee{UserID: matches[0].id, Name: matches[0].name, Email: matches[0].email})
		} else { // unknown or ambiguous → guest by the typed name
			out = append(out, proposalInvitee{Name: name, IsGuest: true})
		}
	}
	return out
}

func (h *AIHandler) aiTimezone(ctx context.Context) *time.Location {
	var tz string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'timezone'`).Scan(&tz)
	if tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			return loc
		}
	}
	return time.UTC
}

func fmtClock(s, e time.Time, loc *time.Location) string {
	return s.In(loc).Format("3:04 PM") + "–" + e.In(loc).Format("3:04 PM")
}

func matchSuffix(mt string) string {
	switch mt {
	case "singles":
		return " (singles)"
	case "doubles":
		return " (doubles)"
	case "casual":
		return " (hit session)"
	case "teaching_pro":
		return " (teaching pro)"
	case "ball_machine":
		return " (ball machine)"
	}
	return ""
}

// bookingTools returns the live court tools exposed to the assistant. The
// propose_booking handler writes its result into *proposal (captured by the
// caller) so the chat can show a Confirm button.
func (h *AIHandler) bookingTools(loc *time.Location, userID string, proposal **bookingProposal) ([]ai.Tool, map[string]ai.ToolFunc) {
	tools := []ai.Tool{
		{Name: "court_availability", Description: "Booked and open court times for a given date.",
			Schema: json.RawMessage(`{"type":"object","properties":{"date":{"type":"string","description":"Date as YYYY-MM-DD (club local time)"}},"required":["date"]}`)},
		{Name: "todays_schedule", Description: "Who is playing today: bookings with courts, times, and player rosters.",
			Schema: json.RawMessage(`{"type":"object","properties":{}}`)},
		{Name: "my_bookings", Description: "The current member's own upcoming bookings.",
			Schema: json.RawMessage(`{"type":"object","properties":{}}`)},
		{Name: "propose_booking", Description: "Find an open court for a time and propose a booking (does NOT book it). The member confirms afterward. Only call this once you know the duration and match type — ask the member first if you don't.",
			Schema: json.RawMessage(`{"type":"object","properties":{"date":{"type":"string","description":"YYYY-MM-DD"},"start_time":{"type":"string","description":"Start time HH:MM in 24h club local time"},"duration_hours":{"type":"number","description":"Duration in hours: 1 or 1.5. Ask the member if unknown."},"match_type":{"type":"string","enum":["singles","doubles","casual"],"description":"singles, doubles, or casual (a hit session). Ask the member if unknown."},"invitees":{"type":"array","items":{"type":"string"},"description":"Names of members or guests the member wants to invite. Empty array if they don't want to invite anyone."}},"required":["date","start_time","duration_hours","match_type"]}`)},
	}

	handlers := map[string]ai.ToolFunc{
		"court_availability": func(ctx context.Context, input json.RawMessage) (string, error) {
			var in struct {
				Date string `json:"date"`
			}
			json.Unmarshal(input, &in)
			day, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(in.Date), loc)
			if err != nil {
				return "I couldn't read that date — use YYYY-MM-DD.", nil
			}
			start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
			end := start.Add(24 * time.Hour)
			rows, err := h.DB.Query(ctx, `
				SELECT ct.name, b.start_time, b.end_time, COALESCE(b.match_type,'')
				FROM bookings b JOIN courts ct ON ct.id = b.court_id
				WHERE b.start_time >= $1 AND b.start_time < $2
				ORDER BY ct.number, b.start_time`, start.UTC(), end.UTC())
			if err != nil {
				return "I couldn't load the schedule.", nil
			}
			defer rows.Close()
			openH, closeH := courtHours(ctx, h.DB)
			var b strings.Builder
			fmt.Fprintf(&b, "Court hours are %s–%s. Booked on %s:\n", fmtHour(openH), fmtHour(closeH), start.Format("Mon Jan 2"))
			any := false
			for rows.Next() {
				var name, mt string
				var s, e time.Time
				if rows.Scan(&name, &s, &e, &mt) == nil {
					any = true
					fmt.Fprintf(&b, "- %s: %s%s\n", name, fmtClock(s, e, loc), matchSuffix(mt))
				}
			}
			if !any {
				b.WriteString("Nothing booked — every court is open all day.\n")
			}
			b.WriteString("Open times are any slots within court hours not listed above.")
			return b.String(), nil
		},

		"todays_schedule": func(ctx context.Context, _ json.RawMessage) (string, error) {
			now := time.Now().In(loc)
			start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
			end := start.Add(24 * time.Hour)
			rows, err := h.DB.Query(ctx, `
				SELECT ct.name, b.start_time, b.end_time, COALESCE(b.match_type,''),
				       hu.first_name || ' ' || hu.last_name,
				       COALESCE(array_agg(DISTINCT mp.player_name) FILTER (WHERE mp.player_name IS NOT NULL), '{}')
				FROM bookings b
				JOIN courts ct ON ct.id = b.court_id
				JOIN users hu ON hu.id = b.user_id
				LEFT JOIN match_players mp ON mp.booking_id = b.id AND mp.withdrew_at IS NULL
				WHERE b.start_time >= $1 AND b.start_time < $2
				GROUP BY b.id, ct.name, b.start_time, b.end_time, b.match_type, hu.first_name, hu.last_name
				ORDER BY b.start_time`, start.UTC(), end.UTC())
			if err != nil {
				return "I couldn't load today's schedule.", nil
			}
			defer rows.Close()
			var b strings.Builder
			b.WriteString("Today's bookings:\n")
			any := false
			for rows.Next() {
				var name, mt, host string
				var s, e time.Time
				var players []string
				if rows.Scan(&name, &s, &e, &mt, &host, &players) == nil {
					any = true
					fmt.Fprintf(&b, "- %s, %s%s — host %s", name, fmtClock(s, e, loc), matchSuffix(mt), host)
					if len(players) > 0 {
						fmt.Fprintf(&b, "; players: %s", strings.Join(players, ", "))
					}
					b.WriteString("\n")
				}
			}
			if !any {
				return "There are no bookings on the courts today.", nil
			}
			return b.String(), nil
		},

		"my_bookings": func(ctx context.Context, _ json.RawMessage) (string, error) {
			rows, err := h.DB.Query(ctx, `
				SELECT ct.name, b.start_time, b.end_time, COALESCE(b.match_type,'')
				FROM bookings b JOIN courts ct ON ct.id = b.court_id
				WHERE b.user_id = $1 AND b.start_time >= NOW()
				ORDER BY b.start_time LIMIT 20`, userID)
			if err != nil {
				return "I couldn't load your bookings.", nil
			}
			defer rows.Close()
			var b strings.Builder
			b.WriteString("Your upcoming bookings:\n")
			any := false
			for rows.Next() {
				var name, mt string
				var s, e time.Time
				if rows.Scan(&name, &s, &e, &mt) == nil {
					any = true
					fmt.Fprintf(&b, "- %s, %s, %s%s\n", name, s.In(loc).Format("Mon Jan 2"), fmtClock(s, e, loc), matchSuffix(mt))
				}
			}
			if !any {
				return "You have no upcoming bookings.", nil
			}
			return b.String(), nil
		},

		"propose_booking": func(ctx context.Context, input json.RawMessage) (string, error) {
			var in struct {
				Date          string   `json:"date"`
				StartTime     string   `json:"start_time"`
				DurationHours float64  `json:"duration_hours"`
				MatchType     string   `json:"match_type"`
				Invitees      []string `json:"invitees"`
			}
			json.Unmarshal(input, &in)
			startLocal, err := time.ParseInLocation("2006-01-02 15:04", strings.TrimSpace(in.Date)+" "+strings.TrimSpace(in.StartTime), loc)
			if err != nil {
				return "I couldn't read that date/time. Ask the member for the day and start time before proposing.", nil
			}
			// Enforce that all required booking details are present and valid BEFORE
			// a court can be proposed. Without these, no proposal is created, so the
			// member never gets a Confirm button — they can't book on partial info.
			dur := in.DurationHours
			if dur != 1 && dur != 1.5 {
				return "I don't have the duration yet. Ask the member whether they want the court for 1 hour or 1½ hours, then call propose_booking again. Do NOT propose a court yet.", nil
			}
			mt := strings.ToLower(strings.TrimSpace(in.MatchType))
			if mt != "singles" && mt != "doubles" && mt != "casual" {
				return "I don't have the match type yet. Ask the member whether it's singles, doubles, or a casual hit, then call propose_booking again. Do NOT propose a court yet.", nil
			}
			endLocal := startLocal.Add(time.Duration(dur * float64(time.Hour)))
			oh, ch := courtHours(ctx, h.DB)
			openH := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), oh, 0, 0, 0, loc)
			closeH := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), ch, 0, 0, 0, loc)
			if startLocal.Before(openH) || endLocal.After(closeH) {
				return fmt.Sprintf("That's outside court hours (%s–%s).", fmtHour(oh), fmtHour(ch)), nil
			}
			if startLocal.Before(time.Now()) {
				return "That time has already passed.", nil
			}
			// Warn about the member's booking limits before proposing.
			if msg := h.checkBookingLimits(ctx, userID, startLocal, endLocal, loc); msg != "" {
				return msg, nil
			}
			var courtID int
			var courtName string
			err = h.DB.QueryRow(ctx, `
				SELECT ct.id, ct.name FROM courts ct
				WHERE NOT EXISTS (
				    SELECT 1 FROM bookings b
				    WHERE b.court_id = ct.id AND b.start_time < $2 AND b.end_time > $1)
				ORDER BY ct.number LIMIT 1`, startLocal.UTC(), endLocal.UTC()).Scan(&courtID, &courtName)
			if err != nil {
				return "No courts are open at that time — try a different time.", nil
			}
			invitees := h.resolveInvitees(ctx, in.Invitees, userID)
			label := fmt.Sprintf("%s · %s · %s%s", courtName, startLocal.Format("Mon, Jan 2"), fmtClock(startLocal, endLocal, loc), matchSuffix(mt))
			*proposal = &bookingProposal{
				CourtID: courtID, CourtName: courtName,
				StartTime: startLocal.Format(time.RFC3339), EndTime: endLocal.Format(time.RFC3339),
				MatchType: mt, PlayersNeeded: playersForMatch(mt), Invitees: invitees, Label: label,
			}
			summary := label
			if len(invitees) > 0 {
				names := make([]string, len(invitees))
				for i, inv := range invitees {
					names[i] = inv.Name
				}
				summary += "; inviting " + strings.Join(names, ", ")
			}
			return fmt.Sprintf("%s is available. Confirm the details (duration, match type, and who's invited) with the member and tell them to tap Confirm to book — tapping Confirm also sends the invitations. Do NOT say it's already booked.", summary), nil
		},
	}
	return tools, handlers
}
