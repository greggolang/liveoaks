CREATE TABLE IF NOT EXISTS tennis_ladder_invite_tokens (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id    UUID        NOT NULL REFERENCES tennis_ladders(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT        NOT NULL UNIQUE,
    status       TEXT        NOT NULL DEFAULT 'pending', -- pending | accepted | declined
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(ladder_id, user_id)
);

CREATE INDEX IF NOT EXISTS tennis_ladder_invite_tokens_token ON tennis_ladder_invite_tokens(token);
