-- 107: per-call AI usage log, so the admin can see Claude spend in Settings.
-- One row per Claude API call with token counts and the computed USD cost.
CREATE TABLE IF NOT EXISTS ai_usage (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    feature            TEXT         NOT NULL DEFAULT 'other',
    model              TEXT         NOT NULL,
    input_tokens       INT          NOT NULL DEFAULT 0,
    output_tokens      INT          NOT NULL DEFAULT 0,
    cache_read_tokens  INT          NOT NULL DEFAULT 0,
    cache_write_tokens INT          NOT NULL DEFAULT 0,
    cost_usd           NUMERIC(12,6) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at);
