CREATE TABLE yolink_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    model TEXT,
    state JSONB NOT NULL DEFAULT '{}',
    alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE yolink_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    raw_event TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
    ('yolink_client_id', ''),
    ('yolink_secret_key', '')
ON CONFLICT (key) DO NOTHING;
