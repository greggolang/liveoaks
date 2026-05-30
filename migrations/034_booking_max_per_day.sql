INSERT INTO settings (key, value) VALUES ('booking_max_per_day', '1') ON CONFLICT (key) DO NOTHING;
