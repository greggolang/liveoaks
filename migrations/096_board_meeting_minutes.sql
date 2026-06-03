CREATE TABLE IF NOT EXISTS board_minutes (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    called_to_order         TEXT,
    adjourned_at            TEXT,
    attendees_present       TEXT,
    attendees_absent        TEXT,
    prev_minutes_approved   BOOLEAN     NOT NULL DEFAULT FALSE,
    treasurer_report        TEXT,
    old_business            TEXT,
    new_business            TEXT,
    action_items            TEXT,
    additional_notes        TEXT,
    submitted_by            TEXT,
    published_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id)
);

-- Add ref_id to member_alerts so minutes alerts link back to the meeting
ALTER TABLE member_alerts ADD COLUMN IF NOT EXISTS ref_id UUID;
