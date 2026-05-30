package reminder

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Mailer interface {
	Send(to, subject, body string) error
}

type Service struct {
	DB     *pgxpool.Pool
	Mailer Mailer
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
			}
		}
	}()
}

func nextHour() time.Time {
	now := time.Now()
	return now.Truncate(time.Hour).Add(time.Hour)
}

func (s *Service) sendReminders(ctx context.Context) {
	// Find bookings starting in 2 hours that haven't been reminded yet
	rows, err := s.DB.Query(ctx,
		`SELECT b.id, b.start_time, b.end_time, ct.name, u.first_name, u.email
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
		var bookingID, courtName, firstName, email string
		var startTime, endTime time.Time
		if err := rows.Scan(&bookingID, &startTime, &endTime, &courtName, &firstName, &email); err != nil {
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
			startTime.Format("Mon Jan 2 at 3:04 PM"),
			endTime.Format("3:04 PM"), s.SiteURL)

		if err := s.Mailer.Send(email, "Reminder: Court booking in 2 hours", body); err != nil {
			log.Printf("reminder email error for %s: %v", email, err)
		} else {
			s.DB.Exec(ctx,
				`INSERT INTO activity_log (event, details) VALUES ('booking_reminder', $1)`,
				fmt.Sprintf("sent to %s for booking %s", email, bookingID))
		}
	}
}
