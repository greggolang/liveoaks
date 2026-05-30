INSERT INTO settings (key, value) VALUES
  ('session_timeout_minutes', '60')
ON CONFLICT (key) DO NOTHING;
