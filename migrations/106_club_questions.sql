-- 106: "Ask the Club" escalations. When the AI assistant can't answer from the
-- club materials, a member can forward the question to the board. Once answered,
-- the reply goes back to the member AND becomes part of the assistant's
-- knowledge so future askers get it automatically.
CREATE TABLE IF NOT EXISTS club_questions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question    TEXT        NOT NULL,
    asked_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    status      TEXT        NOT NULL DEFAULT 'pending',   -- pending | answered
    answer      TEXT,
    answered_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    answered_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS club_questions_status_idx ON club_questions (status, created_at DESC);
