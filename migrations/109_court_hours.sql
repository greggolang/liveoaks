-- 109: configurable court hours (24h). Used by both the real booking validation
-- and the AI assistant's availability/booking logic so they always agree.
-- Defaults match the previous hardcoded 8 AM–8 PM window. Idempotent.
INSERT INTO settings (key, value) VALUES
  ('court_open_hour', '8'),
  ('court_close_hour', '20')
ON CONFLICT (key) DO NOTHING;
