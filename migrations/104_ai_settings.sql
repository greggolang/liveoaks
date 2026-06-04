-- 104: defaults for the Claude/Anthropic integration. The API key is stored
-- under 'anthropic_api_key' (set via the admin UI, never seeded here). Model and
-- enabled flag get sensible defaults. Idempotent: existing values are kept.
INSERT INTO settings (key, value) VALUES
  ('claude_model', 'claude-sonnet-4-6'),
  ('ai_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
