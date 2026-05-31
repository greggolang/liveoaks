-- Ball inventory purchases
CREATE TABLE ball_purchases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_date DATE NOT NULL,
    quantity      INT NOT NULL CHECK (quantity > 0),
    cost_per_can  NUMERIC(10,2),
    total_cost    NUMERIC(10,2),
    notes         TEXT,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ball usage / consumption events
CREATE TABLE ball_usage (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    used_date  DATE NOT NULL,
    quantity   INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    source     TEXT NOT NULL DEFAULT 'booking',   -- booking | pro_shop | manual
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name  TEXT,
    court_name TEXT,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ball_usage_date ON ball_usage (used_date);
CREATE INDEX ball_purchases_date ON ball_purchases (purchase_date);
