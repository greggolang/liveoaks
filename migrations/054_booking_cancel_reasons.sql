ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE TABLE booking_cancel_reasons (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason     TEXT NOT NULL,
    sort_order INT  NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed sensible defaults
INSERT INTO booking_cancel_reasons (reason, sort_order) VALUES
    ('Scheduling conflict',    10),
    ('Weather conditions',     20),
    ('Injury or illness',      30),
    ('Players cancelled',      40),
    ('Personal emergency',     50);
