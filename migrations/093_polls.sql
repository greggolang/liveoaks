CREATE TABLE polls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    question    TEXT NOT NULL,
    options     JSONB NOT NULL DEFAULT '[]',
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ,
    status      TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE poll_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id         UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    selected_option TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (poll_id, user_id)
);
