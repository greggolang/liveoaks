-- Test accounts using dropshot.company so mail can be tested immediately
-- without changing liveoakstennis.com DNS.
-- The @liveoakstennis.com accounts (from 074) will automatically receive mail
-- once the MX record is pointed at this server.
INSERT INTO mail_accounts (address, role_label, display_name) VALUES
    ('president@dropshot.company',      'President (test)',      'Liveoaks President - TEST'),
    ('vice_president@dropshot.company', 'Vice President (test)', 'Liveoaks Vice President - TEST'),
    ('secretary@dropshot.company',      'Secretary (test)',      'Liveoaks Secretary - TEST'),
    ('treasurer@dropshot.company',      'Treasurer (test)',      'Liveoaks Treasurer - TEST'),
    ('entertainment@dropshot.company',  'Entertainment (test)',  'Liveoaks Entertainment - TEST'),
    ('house_grounds@dropshot.company',  'House & Grounds (test)','Liveoaks House & Grounds - TEST'),
    ('membership@dropshot.company',     'Membership (test)',     'Liveoaks Membership - TEST')
ON CONFLICT (address) DO NOTHING;
