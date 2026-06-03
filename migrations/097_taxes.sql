CREATE TABLE IF NOT EXISTS tax_documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category      TEXT NOT NULL DEFAULT 'filing',  -- filing | exemption | other
    label         TEXT NOT NULL,
    tax_year      INT,
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_contractors (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_year       INT NOT NULL,
    name           TEXT NOT NULL,
    amount_paid    NUMERIC(12,2) NOT NULL DEFAULT 0,
    w9_received    BOOLEAN NOT NULL DEFAULT false,
    form_1099_sent BOOLEAN NOT NULL DEFAULT false,
    notes          TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
    ('tax_ein', ''),
    ('sales_tax_rate', '9.5')
ON CONFLICT (key) DO NOTHING;
