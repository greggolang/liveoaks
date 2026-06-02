-- Financial enforcement rules
CREATE TABLE financial_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    condition TEXT NOT NULL CHECK (condition IN ('unpaid_dues', 'any_outstanding_balance')),
    grace_days INT NOT NULL DEFAULT 30,
    actions TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO financial_rules (name, enabled, condition, grace_days, actions) VALUES
    ('Overdue Annual Dues', true, 'unpaid_dues', 30,
     ARRAY['block_bookings', 'dashboard_warning', 'email_reminder']),
    ('Outstanding Account Balance', false, 'any_outstanding_balance', 60,
     ARRAY['block_bookings', 'block_kiosk', 'dashboard_warning']);

-- Misc one-off charges (pro lessons, assessments, event fees, etc.)
CREATE TABLE member_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'waived')),
    paid_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX member_charges_user_idx ON member_charges(user_id, created_at DESC);
CREATE INDEX member_charges_unpaid_idx ON member_charges(user_id) WHERE status = 'unpaid';

-- Kiosk tab payments: admin records when a member settles their kiosk balance
CREATE TABLE kiosk_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    notes TEXT,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX kiosk_payments_user_idx ON kiosk_payments(user_id, created_at DESC);
