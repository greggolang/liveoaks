CREATE TABLE user_notification_prefs (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    booking_confirmation BOOLEAN NOT NULL DEFAULT true,
    match_invitation     BOOLEAN NOT NULL DEFAULT true,
    booking_reminder     BOOLEAN NOT NULL DEFAULT true,
    announcement         BOOLEAN NOT NULL DEFAULT true,
    broadcast            BOOLEAN NOT NULL DEFAULT true,
    event_notification   BOOLEAN NOT NULL DEFAULT true,
    board_meeting        BOOLEAN NOT NULL DEFAULT true,
    ladder_challenge     BOOLEAN NOT NULL DEFAULT true,
    liveball_invitation  BOOLEAN NOT NULL DEFAULT true,
    member_message       BOOLEAN NOT NULL DEFAULT true,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
