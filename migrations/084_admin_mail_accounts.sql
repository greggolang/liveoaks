INSERT INTO mail_accounts (address, role_label, display_name) VALUES
    ('admin@liveoakstennis.com', 'Admin', 'Liveoaks Tennis Club Admin'),
    ('admin@dropshot.company',    'Admin (test)', 'Liveoaks Admin - TEST')
ON CONFLICT (address) DO NOTHING;
