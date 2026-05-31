CREATE TABLE booking_day_reminder_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    match_player_id UUID REFERENCES match_players(id) ON DELETE SET NULL,
    player_name TEXT NOT NULL,
    player_email TEXT NOT NULL,
    is_host BOOLEAN NOT NULL DEFAULT FALSE,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | issue
    issue_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

-- Prevent duplicate reminders for the same roster slot
CREATE UNIQUE INDEX booking_day_reminder_tokens_player_idx
    ON booking_day_reminder_tokens(match_player_id)
    WHERE match_player_id IS NOT NULL;
