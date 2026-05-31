-- 070: kiosk settings
INSERT INTO settings (key, value) VALUES ('kiosk_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
