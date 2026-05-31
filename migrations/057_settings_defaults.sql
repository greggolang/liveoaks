INSERT INTO settings (key, value) VALUES
    ('booking_cancel_hours',        '2'),
    ('withdrawal_min_notice_hours', '0.5')
ON CONFLICT (key) DO NOTHING;
