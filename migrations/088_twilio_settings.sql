INSERT INTO settings (key, value) VALUES
    ('twilio_account_sid', ''),
    ('twilio_auth_token', ''),
    ('twilio_from', '')
ON CONFLICT (key) DO NOTHING;
