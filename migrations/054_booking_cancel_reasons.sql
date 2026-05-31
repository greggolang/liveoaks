ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE TABLE booking_cancel_reasons (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason     TEXT NOT NULL,
    sort_order INT  NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed sensible defaults (idempotent — skips rows that already exist)
INSERT INTO booking_cancel_reasons (reason, sort_order) SELECT 'Scheduling conflict',  10 WHERE NOT EXISTS (SELECT 1 FROM booking_cancel_reasons WHERE reason = 'Scheduling conflict');
INSERT INTO booking_cancel_reasons (reason, sort_order) SELECT 'Weather conditions',   20 WHERE NOT EXISTS (SELECT 1 FROM booking_cancel_reasons WHERE reason = 'Weather conditions');
INSERT INTO booking_cancel_reasons (reason, sort_order) SELECT 'Injury or illness',    30 WHERE NOT EXISTS (SELECT 1 FROM booking_cancel_reasons WHERE reason = 'Injury or illness');
INSERT INTO booking_cancel_reasons (reason, sort_order) SELECT 'Players cancelled',    40 WHERE NOT EXISTS (SELECT 1 FROM booking_cancel_reasons WHERE reason = 'Players cancelled');
INSERT INTO booking_cancel_reasons (reason, sort_order) SELECT 'Personal emergency',   50 WHERE NOT EXISTS (SELECT 1 FROM booking_cancel_reasons WHERE reason = 'Personal emergency');
