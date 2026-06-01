CREATE TABLE IF NOT EXISTS mail_accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    address         TEXT        UNIQUE NOT NULL,
    role_label      TEXT        NOT NULL,
    display_name    TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL DEFAULT '',
    assigned_user_id UUID       REFERENCES users(id) ON DELETE SET NULL,
    quota_mb        INT         NOT NULL DEFAULT 1000,
    active          BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the standard board role mailboxes
INSERT INTO mail_accounts (address, role_label, display_name) VALUES
    ('president@liveoakstennis.com',     'President',     'Liveoaks Tennis Club President'),
    ('vice_president@liveoakstennis.com','Vice President','Liveoaks Tennis Club Vice President'),
    ('secretary@liveoakstennis.com',     'Secretary',     'Liveoaks Tennis Club Secretary'),
    ('treasurer@liveoakstennis.com',     'Treasurer',     'Liveoaks Tennis Club Treasurer'),
    ('entertainment@liveoakstennis.com', 'Entertainment', 'Liveoaks Tennis Club Entertainment'),
    ('house_grounds@liveoakstennis.com', 'House & Grounds','Liveoaks Tennis Club House & Grounds'),
    ('membership@liveoakstennis.com',    'Membership',    'Liveoaks Tennis Club Membership')
ON CONFLICT (address) DO NOTHING;
