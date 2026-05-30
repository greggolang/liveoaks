CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event TEXT NOT NULL,
    details TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_log_created_at ON activity_log (created_at DESC);
