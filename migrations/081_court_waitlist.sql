CREATE TABLE court_waitlist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id    INT  NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ NOT NULL,
    notified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (court_id, user_id, start_time)
);
CREATE INDEX ON court_waitlist (court_id, start_time, created_at);

ALTER TABLE user_notification_prefs
    ADD COLUMN IF NOT EXISTS court_waitlist BOOLEAN NOT NULL DEFAULT true;
