-- Persistent log of cancelled bookings. The bookings row is deleted on cancel,
-- so we snapshot the relevant fields here for reporting.
CREATE TABLE IF NOT EXISTS booking_cancellations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id        UUID,
    court_name        TEXT,
    match_type        TEXT,
    start_time        TIMESTAMPTZ,
    end_time          TIMESTAMPTZ,
    owner_name        TEXT,           -- member the booking belonged to
    reason            TEXT,           -- selected/entered cancellation reason (nullable)
    cancelled_by      UUID,           -- user who performed the cancellation
    cancelled_by_name TEXT,
    cancelled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_at
    ON booking_cancellations (cancelled_at DESC);
