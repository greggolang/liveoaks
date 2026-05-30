INSERT INTO settings (key, value) VALUES ('timezone', 'America/Los_Angeles')
ON CONFLICT (key) DO NOTHING;
