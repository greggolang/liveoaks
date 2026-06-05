-- Rule 1: max total future (unfulfilled) reservations per member
INSERT INTO settings (key, value) VALUES ('booking_max_future_total', '5')
  ON CONFLICT (key) DO NOTHING;

-- Rule 6: hour of day (local) at which the N-days-ahead window opens
INSERT INTO settings (key, value) VALUES ('booking_advance_open_hour', '8')
  ON CONFLICT (key) DO NOTHING;

-- Rule 8: weekend court opening time (8:30 AM by default)
INSERT INTO settings (key, value) VALUES ('court_open_hour_weekend', '8')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('court_open_minute_weekend', '30')
  ON CONFLICT (key) DO NOTHING;

-- Rules 4 & 5: raise the cross-court gap to 60 minutes (1 hour)
INSERT INTO settings (key, value) VALUES ('booking_min_gap_minutes', '60')
  ON CONFLICT (key) DO UPDATE SET value = '60';
