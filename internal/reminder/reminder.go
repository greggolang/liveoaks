package reminder

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Mailer interface {
	Send(to, subject, body string) error
}

type Service struct {
	DB      *pgxpool.Pool
	Mailer  Mailer
	SiteURL string
}

func (s *Service) Start(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Until(nextHour())):
				s.sendReminders(ctx)
				s.sendScorePrompts(ctx)
				// Send day-of reminders at 7am club-local time
				loc := s.loadTimezone(ctx)
				if time.Now().In(loc).Hour() == 7 {
					s.sendDayOfReminders(ctx)
				}
			}
		}
	}()
}

func nextHour() time.Time {
	now := time.Now()
	return now.Truncate(time.Hour).Add(time.Hour)
}

func (s *Service) loadTimezone(ctx context.Context) *time.Location {
	var tz string
	s.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'timezone'`).Scan(&tz)
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

func (s *Service) sendReminders(ctx context.Context) {
	loc := s.loadTimezone(ctx)
	// Find bookings starting in 2 hours that haven't been reminded yet
	rows, err := s.DB.Query(ctx,
		`SELECT b.id, b.start_time, b.end_time, ct.name, u.id, u.first_name, u.email
		 FROM bookings b
		 JOIN users u ON u.id = b.user_id
		 JOIN courts ct ON ct.id = b.court_id
		 WHERE b.start_time BETWEEN NOW() + INTERVAL '1h 50m' AND NOW() + INTERVAL '2h 10m'
		   AND NOT EXISTS (
		       SELECT 1 FROM activity_log
		       WHERE event = 'booking_reminder' AND details LIKE '%' || b.id || '%'
		   )`)
	if err != nil {
		log.Printf("reminder query error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var bookingID, courtName, userID, firstName, email string
		var startTime, endTime time.Time
		if err := rows.Scan(&bookingID, &startTime, &endTime, &courtName, &userID, &firstName, &email); err != nil {
			continue
		}
		if !notifprefs.UserWantsEmail(ctx, s.DB, userID, "booking_reminder") {
			continue
		}

		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Court Booking Reminder</h2>
  <p>Hi %s,</p>
  <p>This is a reminder that you have a court booking coming up:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
    <strong>%s</strong><br>
    %s – %s
  </div>
  <p><a href="%s/bookings" style="color:#15803d">View your bookings</a></p>
</div>`, firstName, courtName,
			startTime.In(loc).Format("Mon Jan 2 at 3:04 PM MST"),
			endTime.In(loc).Format("3:04 PM MST"), s.SiteURL)

		if err := s.Mailer.Send(email, "Reminder: Court booking in 2 hours", body); err != nil {
			log.Printf("reminder email error for %s: %v", email, err)
		} else {
			s.DB.Exec(ctx,
				`INSERT INTO activity_log (event, details) VALUES ('booking_reminder', $1)`,
				fmt.Sprintf("sent to %s for booking %s", email, bookingID))
		}
	}
}

// sendScorePrompts emails the host of every singles/doubles booking that ended
// in the last ~75 minutes, inviting them to enter the match score. It runs each
// hourly tick and de-dupes via activity_log so each booking is prompted once.
func (s *Service) sendScorePrompts(ctx context.Context) {
	rows, err := s.DB.Query(ctx, `
		SELECT b.id, ct.name, u.id, u.first_name, u.email
		FROM bookings b
		JOIN users u ON u.id = b.user_id
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.match_type IN ('singles', 'doubles')
		  AND b.end_time BETWEEN NOW() - INTERVAL '75 minutes' AND NOW()
		  AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.booking_id = b.id)
		  AND NOT EXISTS (
		      SELECT 1 FROM activity_log
		      WHERE event = 'score_prompt' AND details LIKE '%' || b.id || '%'
		  )`)
	if err != nil {
		log.Printf("score prompt query error: %v", err)
		return
	}
	defer rows.Close()

	type prompt struct{ bookingID, courtName, userID, firstName, email string }
	var prompts []prompt
	for rows.Next() {
		var p prompt
		if err := rows.Scan(&p.bookingID, &p.courtName, &p.userID, &p.firstName, &p.email); err != nil {
			continue
		}
		prompts = append(prompts, p)
	}
	rows.Close()

	for _, p := range prompts {
		// Record the prompt first so we never re-ask, even if the email is
		// skipped by preference or fails.
		s.DB.Exec(ctx,
			`INSERT INTO activity_log (event, details) VALUES ('score_prompt', $1)`,
			fmt.Sprintf("host %s for booking %s", p.email, p.bookingID))

		if p.email == "" || !notifprefs.UserWantsEmail(ctx, s.DB, p.userID, "booking_reminder") {
			continue
		}
		body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 How did your match go?</h2>
  <p>Hi %s,</p>
  <p>Your match on <strong>%s</strong> just wrapped up. Want to record the score?</p>
  <p style="margin:20px 0">
    <a href="%s/scores" style="background:#15803d;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Enter the score →</a>
  </p>
  <p style="color:#9ca3af;font-size:12px">You choose whether the result is private to the players or shared on the club scoreboard.</p>
</div>`, p.firstName, p.courtName, s.SiteURL)

		if err := s.Mailer.Send(p.email, "Enter your match score – Live Oaks Tennis Club", body); err != nil {
			log.Printf("score prompt email error for %s: %v", p.email, err)
		}
	}
}

// sendDayOfReminders runs at 7am and emails every player on every booking
// happening today. Each email has "I'm Good to Go" and "I Have an Issue" buttons.
// If a player reports an issue, they are removed from the roster and the host is notified.
func (s *Service) sendDayOfReminders(ctx context.Context) {
	loc := s.loadTimezone(ctx)
	now := time.Now().In(loc)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	dayEnd := dayStart.Add(24 * time.Hour)

	matchTypeLabels := map[string]string{
		"singles": "Singles", "doubles": "Doubles",
		"casual": "Hit Session", "ball_machine": "Ball Machine",
	}

	// Step 1: All bookings today
	type bookingInfo struct {
		id        string
		startTime time.Time
		endTime   time.Time
		courtName string
		matchType string
		hostName  string
	}
	bRows, err := s.DB.Query(ctx, `
		SELECT DISTINCT b.id, b.start_time, b.end_time, ct.name, b.match_type,
		       hu.first_name || ' ' || hu.last_name
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		JOIN users hu ON hu.id = b.user_id
		WHERE b.start_time >= $1 AND b.start_time < $2
		ORDER BY b.start_time`,
		dayStart.UTC(), dayEnd.UTC())
	if err != nil {
		log.Printf("day-of reminder booking query error: %v", err)
		return
	}
	var bookings []bookingInfo
	for bRows.Next() {
		var bi bookingInfo
		if err := bRows.Scan(&bi.id, &bi.startTime, &bi.endTime, &bi.courtName, &bi.matchType, &bi.hostName); err != nil {
			continue
		}
		bookings = append(bookings, bi)
	}
	bRows.Close()

	for _, bi := range bookings {
		// Step 2: All players for this booking (with their emails), marking which need a reminder
		type playerInfo struct {
			matchPlayerID string
			name          string
			email         string
			phone         string
			ustaRanking   string
			isHost        bool
			isGuest       bool
			userID        *string
			needsReminder bool
		}

		pRows, err := s.DB.Query(ctx, `
			SELECT mp.id::text, mp.player_name,
			       COALESCE(mp.player_email, u.email),
			       COALESCE(u.phone, ''),
			       COALESCE(u.usta_ranking, ''),
			       mp.is_host,
			       mp.is_guest,
			       u.id,
			       NOT EXISTS (
			           SELECT 1 FROM booking_day_reminder_tokens bdr
			           WHERE bdr.match_player_id = mp.id
			       ) AS needs_reminder
			FROM match_players mp
			LEFT JOIN users u ON u.id = mp.user_id
			WHERE mp.booking_id = $1
			ORDER BY mp.is_host DESC, mp.added_at`, bi.id)
		if err != nil {
			log.Printf("day-of reminder player query error for booking %s: %v", bi.id, err)
			continue
		}

		var players []playerInfo
		for pRows.Next() {
			var p playerInfo
			var emailPtr *string
			if err := pRows.Scan(&p.matchPlayerID, &p.name, &emailPtr, &p.phone, &p.ustaRanking, &p.isHost, &p.isGuest, &p.userID, &p.needsReminder); err != nil {
				continue
			}
			if emailPtr == nil {
				continue
			}
			p.email = *emailPtr
			players = append(players, p)
		}
		pRows.Close()

		// Skip if nobody needs a reminder
		anyNeeds := false
		for _, p := range players {
			if p.needsReminder {
				anyNeeds = true
				break
			}
		}
		if !anyNeeds {
			continue
		}

		startStr := bi.startTime.In(loc).Format("3:04 PM MST")
		endStr := bi.endTime.In(loc).Format("3:04 PM MST")
		matchLabel := matchTypeLabels[bi.matchType]
		if matchLabel == "" {
			matchLabel = "Tennis"
		}

		// Build the player list for the email body
		playerListHTML := "<ul style='padding-left:20px;margin:8px 0'>"
		for _, p := range players {
			// Tag the host / guests next to the name
			var tags string
			if p.isHost {
				tags += " <span style='color:#15803d;font-weight:600'>(Host)</span>"
			}
			if p.isGuest {
				tags += " <span style='color:#9ca3af'>(Guest)</span>"
			}

			// Collect the optional contact / rating details
			var details []string
			if p.ustaRanking != "" {
				details = append(details, fmt.Sprintf("USTA %s", p.ustaRanking))
			}
			if p.email != "" {
				details = append(details, fmt.Sprintf("<a href='mailto:%s' style='color:#166534'>%s</a>", p.email, p.email))
			}
			if p.phone != "" {
				details = append(details, fmt.Sprintf("<a href='tel:%s' style='color:#166534'>%s</a>", p.phone, p.phone))
			}

			detailHTML := ""
			if len(details) > 0 {
				detailHTML = "<br><span style='color:#6b7280;font-size:13px'>" + strings.Join(details, " · ") + "</span>"
			}

			playerListHTML += fmt.Sprintf("<li style='margin:6px 0'><strong>%s</strong>%s%s</li>", p.name, tags, detailHTML)
		}
		playerListHTML += "</ul>"

		// Step 3: Send reminder to each player that hasn't received one yet
		for _, p := range players {
			if !p.needsReminder {
				continue
			}

			tokenBytes := make([]byte, 20)
			rand.Read(tokenBytes)
			token := hex.EncodeToString(tokenBytes)

			_, err := s.DB.Exec(ctx, `
				INSERT INTO booking_day_reminder_tokens
				    (booking_id, match_player_id, player_name, player_email, is_host, token)
				VALUES ($1, $2::uuid, $3, $4, $5, $6)
				ON CONFLICT DO NOTHING`,
				bi.id, p.matchPlayerID, p.name, p.email, p.isHost, token)
			if err != nil {
				log.Printf("day-of reminder token insert error for %s: %v", p.email, err)
				continue
			}

			okURL := fmt.Sprintf("%s/booking-reminder/%s/ok", s.SiteURL, token)
			issueURL := fmt.Sprintf("%s/booking-reminder/%s/issue", s.SiteURL, token)

			body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Booking Reminder – Live Oaks Tennis Club</h2>
  <p>Hi %s,</p>
  <p>You have a booking today at <strong>Live Oaks Tennis Club</strong>:</p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0">
    <div style="margin:4px 0">🎾 <strong>%s</strong></div>
    <div style="margin:4px 0">⏰ <strong>%s – %s</strong></div>
    <div style="margin:4px 0">📋 %s</div>
    <div style="margin-top:12px;color:#166534;font-weight:600">Players:</div>
    %s
  </div>
  <table style="border-collapse:collapse;margin:24px 0">
    <tr>
      <td style="padding-right:12px">
        <a href="%s"
           style="background:#15803d;color:#fff;padding:14px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          ✅ I'm Good to Go
        </a>
      </td>
      <td>
        <a href="%s"
           style="background:#dc2626;color:#fff;padding:14px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          ⚠️ I Have an Issue
        </a>
      </td>
    </tr>
  </table>
  <p style="color:#9ca3af;font-size:12px">
    If you have an issue, let us know so we can find a replacement in time.
  </p>
</div>`, p.name, bi.courtName, startStr, endStr, matchLabel, playerListHTML, okURL, issueURL)

			if p.userID != nil && !notifprefs.UserWantsEmail(ctx, s.DB, *p.userID, "booking_reminder") {
				continue
			}
			if err := s.Mailer.Send(p.email, "Today's Booking Reminder – Live Oaks Tennis Club", body); err != nil {
				log.Printf("day-of reminder email error for %s: %v", p.email, err)
			} else {
				log.Printf("day-of reminder sent to %s for booking %s", p.email, bi.id)
			}
		}
	}
}
