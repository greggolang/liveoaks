INSERT INTO mail_accounts (address, role_label, display_name) VALUES
    ('admin@liveoakstennis.com', 'Admin', 'Liveoaks Tennis Club Admin'),
    ('admin@webgoserver.com',    'Admin (test)', 'Liveoaks Admin - TEST')
ON CONFLICT (address) DO NOTHING;
