INSERT INTO settings (key, value) VALUES
    ('smtp_host', ''),
    ('smtp_port', '587'),
    ('smtp_user', ''),
    ('smtp_pass', ''),
    ('smtp_from', '')
ON CONFLICT (key) DO NOTHING;
