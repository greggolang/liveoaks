package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type NotifPrefsHandler struct {
	DB *pgxpool.Pool
}

type NotificationPrefs struct {
	BookingConfirmation bool `json:"booking_confirmation"`
	MatchInvitation     bool `json:"match_invitation"`
	BookingReminder     bool `json:"booking_reminder"`
	Announcement        bool `json:"announcement"`
	Broadcast           bool `json:"broadcast"`
	EventNotification   bool `json:"event_notification"`
	BoardMeeting        bool `json:"board_meeting"`
	LadderChallenge     bool `json:"ladder_challenge"`
	LiveballInvitation  bool `json:"liveball_invitation"`
	MemberMessage       bool `json:"member_message"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// Get returns the current user's notification preferences (all true by default).
func (h *NotifPrefsHandler) Get(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var p NotificationPrefs
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT booking_confirmation, match_invitation, booking_reminder,
		       announcement, broadcast, event_notification, board_meeting,
		       ladder_challenge, liveball_invitation, member_message, updated_at
		FROM user_notification_prefs
		WHERE user_id = $1`, userID).Scan(
		&p.BookingConfirmation, &p.MatchInvitation, &p.BookingReminder,
		&p.Announcement, &p.Broadcast, &p.EventNotification, &p.BoardMeeting,
		&p.LadderChallenge, &p.LiveballInvitation, &p.MemberMessage, &p.UpdatedAt,
	)
	if err != nil {
		// No row yet — return all-true defaults
		p = NotificationPrefs{
			BookingConfirmation: true, MatchInvitation: true, BookingReminder: true,
			Announcement: true, Broadcast: true, EventNotification: true,
			BoardMeeting: true, LadderChallenge: true, LiveballInvitation: true,
			MemberMessage: true, UpdatedAt: time.Now(),
		}
	}
	return c.JSON(http.StatusOK, p)
}

// Update upserts the current user's notification preferences.
func (h *NotifPrefsHandler) Update(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req NotificationPrefs
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(), `
		INSERT INTO user_notification_prefs
		    (user_id, booking_confirmation, match_invitation, booking_reminder,
		     announcement, broadcast, event_notification, board_meeting,
		     ladder_challenge, liveball_invitation, member_message, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
		    booking_confirmation = EXCLUDED.booking_confirmation,
		    match_invitation     = EXCLUDED.match_invitation,
		    booking_reminder     = EXCLUDED.booking_reminder,
		    announcement         = EXCLUDED.announcement,
		    broadcast            = EXCLUDED.broadcast,
		    event_notification   = EXCLUDED.event_notification,
		    board_meeting        = EXCLUDED.board_meeting,
		    ladder_challenge     = EXCLUDED.ladder_challenge,
		    liveball_invitation  = EXCLUDED.liveball_invitation,
		    member_message       = EXCLUDED.member_message,
		    updated_at           = NOW()`,
		userID,
		req.BookingConfirmation, req.MatchInvitation, req.BookingReminder,
		req.Announcement, req.Broadcast, req.EventNotification, req.BoardMeeting,
		req.LadderChallenge, req.LiveballInvitation, req.MemberMessage,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save preferences")
	}
	return c.NoContent(http.StatusNoContent)
}
