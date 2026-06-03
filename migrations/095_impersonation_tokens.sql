CREATE TABLE IF NOT EXISTS impersonation_tokens (
    token      TEXT        PRIMARY KEY,
    target_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);
