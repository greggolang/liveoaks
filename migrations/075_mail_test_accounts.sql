-- Test accounts using webgoserver.com so mail can be tested immediately
-- without changing liveoakstennis.com DNS.
-- The @liveoakstennis.com accounts (from 074) will automatically receive mail
-- once the MX record is pointed at this server.
INSERT INTO mail_accounts (address, role_label, display_name) VALUES
    ('president@webgoserver.com',      'President (test)',      'Liveoaks President - TEST'),
    ('vice_president@webgoserver.com', 'Vice President (test)', 'Liveoaks Vice President - TEST'),
    ('secretary@webgoserver.com',      'Secretary (test)',      'Liveoaks Secretary - TEST'),
    ('treasurer@webgoserver.com',      'Treasurer (test)',      'Liveoaks Treasurer - TEST'),
    ('entertainment@webgoserver.com',  'Entertainment (test)',  'Liveoaks Entertainment - TEST'),
    ('house_grounds@webgoserver.com',  'House & Grounds (test)','Liveoaks House & Grounds - TEST'),
    ('membership@webgoserver.com',     'Membership (test)',     'Liveoaks Membership - TEST')
ON CONFLICT (address) DO NOTHING;
