CREATE TABLE court_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id INT REFERENCES courts(id) ON DELETE CASCADE,  -- NULL = all courts
    reason TEXT NOT NULL DEFAULT 'Court Washing',
    block_type TEXT NOT NULL DEFAULT 'recurring_weekly',   -- 'recurring_weekly' | 'one_time'
    -- Recurring weekly fields:
    day_of_week SMALLINT,  -- 0=Sun, 1=Mon, ..., 6=Sat
    start_time TIME,       -- local time e.g. '07:00'
    end_time TIME,         -- local time e.g. '09:00'
    -- One-time fields:
    one_time_start TIMESTAMPTZ,
    one_time_end TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
