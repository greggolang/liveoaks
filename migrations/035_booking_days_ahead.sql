INSERT INTO settings (key, value) VALUES ('booking_max_days_ahead', '5') ON CONFLICT (key) DO NOTHING;
