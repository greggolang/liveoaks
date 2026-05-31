-- 068: add session_timeout_days setting (0 = never log out)
-- This replaces the old session_timeout_minutes for the admin UI.
-- The old key is kept for backwards-compatibility but is no longer surfaced.
INSERT INTO settings (key, value)
VALUES ('session_timeout_days', '0')
ON CONFLICT (key) DO NOTHING;
