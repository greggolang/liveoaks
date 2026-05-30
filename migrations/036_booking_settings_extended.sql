INSERT INTO settings (key, value) VALUES
  ('booking_open_time',         ''),
  ('booking_allow_sub',         'true'),
  ('booking_allow_any_sub',     'false'),
  ('booking_max_minutes_per_day',''),
  ('booking_max_courts_per_week',''),
  ('booking_max_family_per_day', ''),
  ('booking_max_per_week',       ''),
  ('booking_min_gap_minutes',    '30')
ON CONFLICT (key) DO NOTHING;
