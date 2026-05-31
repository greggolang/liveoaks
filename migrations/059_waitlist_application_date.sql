ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS application_date DATE;

-- Import LOTA waitlist as of 4/6/26.
-- created_at is set to the application date so natural sort order is preserved.
-- Hamadi and Brenek were "rolled to bottom" so their created_at reflects
-- when they were rolled, not their original application date.
INSERT INTO waitlist (first_name, last_name, email, status, application_date, created_at, notes) VALUES
  ('Florida',    'Bailey',       'florindabailey@sbcglobal.net',   'pending', '2026-04-15', '2026-04-15 00:00:00+00', 'MOVED from In Active on 4/15/26'),
  ('Peter',      'Nowogrodzki',  'peter@connerliterary.com',        'pending', '2022-09-29', '2022-09-29 00:00:00+00', NULL),
  ('Debbie',     'Sierra',       'foursierras@sbcglobal.net',       'pending', '2023-01-26', '2023-01-26 00:00:00+00', NULL),
  ('Jim',        'Dowd',         'jimdowdcalifornia@gmail.com',     'pending', '2023-01-26', '2023-01-26 01:00:00+00', NULL),
  ('Anthony',    'Cannizzo',     'anthonycannizzo@gmail.com',       'pending', '2023-02-14', '2023-02-14 00:00:00+00', NULL),
  ('Mandy',      'Pardehpoosh',  'jolajola9@hotmail.com',           'pending', '2023-02-23', '2023-02-23 00:00:00+00', NULL),
  ('Felipe',     'Velasquez',    'fvelasquez@osi-systems.com',      'pending', '2023-03-20', '2023-03-20 00:00:00+00', NULL),
  ('Kristen',    'Harrington',   'krissd8@gmail.com',               'pending', '2023-03-28', '2023-03-28 00:00:00+00', NULL),
  ('Jacqueline', 'Roth',         'jroth@boltonco.com',              'pending', '2023-04-01', '2023-04-01 00:00:00+00', NULL),
  ('Cindi',      'Carter',       'cindicarter@mac.com',             'pending', '2023-04-05', '2023-04-05 00:00:00+00', NULL),
  ('Monica',     'Clouet',       'monicaxu88wonderful@gmail.com',   'pending', '2023-04-05', '2023-04-05 01:00:00+00', 'Email updated 4/30/23'),
  ('Alex',       'Blatt',        'alexb4@gmail.com',                'pending', '2023-04-19', '2023-04-19 00:00:00+00', NULL),
  ('Karla',      'Thompson',     'drk@smilehausortho.com',          'pending', '2023-05-09', '2023-05-09 00:00:00+00', NULL),
  -- Hamadi originally applied 2/8/2022 but declined offer 6/2023 and was rolled to bottom
  ('Aram',       'Hamadi',       'aram1hamidi@gmail.com',           'pending', '2022-02-08', '2023-06-30 00:00:00+00', 'Applied 2/8/2022; declined offer 6/2023, rolled to bottom'),
  ('Andrea',     'Kretzmann',    'andrea.kretzmann@gmail.com',      'pending', '2023-07-26', '2023-07-26 00:00:00+00', NULL),
  ('Stephen',    'Perkins',      'smperkins1991@gmail.com',         'pending', '2023-07-26', '2023-07-26 01:00:00+00', NULL),
  -- Brenek originally applied 3/17/2022; offered 8/17/2023, declined 8/22/23, rolled to bottom
  ('Jill',       'Brenek',       'jillbrenek@gmail.com',            'pending', '2022-03-17', '2023-08-23 00:00:00+00', 'Applied 3/17/2022; offered 8/17/2023, declined 8/22/23, rolled to bottom'),
  ('Ayuko',      'Siegel',       'ayuko.siegel@gmail.com',          'pending', '2023-09-12', '2023-09-12 00:00:00+00', NULL),
  ('Ghia',       'Godfree',      'ghiagodfree@gmail.com',           'pending', '2023-10-13', '2023-10-13 00:00:00+00', NULL),
  ('Linda',      'Lyke',         'lflyke@gmail.com',                'pending', '2023-10-13', '2023-10-13 01:00:00+00', NULL),
  ('Lorna',      'Kim',          'lornaleekim@gmail.com',           'pending', '2023-10-22', '2023-10-22 00:00:00+00', NULL),
  ('Karen',      'Tamis',        'karen.tamis@gmail.com',           'pending', '2023-11-14', '2023-11-14 00:00:00+00', NULL),
  ('Jeff',       'Niedermyer',   'jeff.niedermeyer@gmail.com',      'pending', '2023-11-15', '2023-11-15 00:00:00+00', NULL),
  ('Hugh',       'Allen',        'hugh.allen1@gmail.com',           'pending', '2023-11-15', '2023-11-15 01:00:00+00', NULL),
  ('Bryant',     'Yung',         'bryantyung@yahoo.com',            'pending', '2023-11-17', '2023-11-17 00:00:00+00', NULL),
  ('Rani',       'Ranade',       'ranade.rani@gmail.com',           'pending', '2023-11-18', '2023-11-18 00:00:00+00', NULL),
  ('Isaac',      'George',       'eyesakg@gmail.com',               'pending', '2023-12-04', '2023-12-04 00:00:00+00', NULL),
  ('Rebecca',    'Hsai',         'rebeccatu@gmail.com',             'pending', '2023-12-12', '2023-12-12 00:00:00+00', NULL),
  ('Stacey',     'Zhao',         'staceyczhao@gmail.com',           'pending', '2023-12-18', '2023-12-18 00:00:00+00', NULL),
  ('Leslie',     'Jiang',        'jiangleslie7714@gmail.com',       'pending', '2023-12-30', '2023-12-30 00:00:00+00', NULL),
  ('Amy',        'Lyford',       'alyford@gmail.com',               'pending', '2023-12-30', '2023-12-30 01:00:00+00', NULL),
  ('Carol',      'Goldthwait',   'caroldelat@mac.com',              'pending', '2024-01-29', '2024-01-29 00:00:00+00', NULL),
  ('Gavin',      'Lau',          'gavin.lau@nbcuni.com',            'pending', '2024-01-30', '2024-01-30 00:00:00+00', NULL),
  ('John',       'Dam',          'johndam@gmail.com',               'pending', '2024-03-19', '2024-03-19 00:00:00+00', NULL),
  ('Zoro',       'Vartanian',    'zoro.vartanian79@gmail.com',      'pending', '2024-05-16', '2024-05-16 00:00:00+00', NULL),
  ('Kathy',      'Foy-Asaro',    'kittyfoy@yahoo.com',              'pending', '2024-05-22', '2024-05-22 00:00:00+00', NULL),
  ('Jay',        'Ho',           'hojen7@yahoo.com',                'pending', '2024-05-30', '2024-05-30 00:00:00+00', NULL),
  ('Stephanie',  'Chen',         'schen928@gmail.com',              'pending', '2024-05-30', '2024-05-30 01:00:00+00', 'Also known as Yong'),
  ('Lisa',       'Paez',         'lisapaez@gmail.com',              'pending', '2024-06-14', '2024-06-14 00:00:00+00', NULL),
  ('Shayna',     'Mckinney',     'schabner@gmail.com',              'pending', '2024-06-14', '2024-06-14 01:00:00+00', NULL),
  ('Rex',        'Sheng',        'shengrex@gmail.com',              'pending', '2024-06-19', '2024-06-19 00:00:00+00', NULL),
  ('Kristen',    'Carter',       'kristencarter818@gmail.com',      'pending', '2024-06-20', '2024-06-20 00:00:00+00', NULL),
  ('Loris',      'Memic',        'lorismemic@yahoo.com',            'pending', '2024-07-08', '2024-07-08 00:00:00+00', NULL),
  ('Robert',     'Carter',       'robertcarter2014@gmail.com',      'pending', '2025-02-11', '2025-02-11 00:00:00+00', NULL),
  ('Charlie',    'Tadman',       'charlietadman@icloud.com',        'pending', NULL,          NOW(),                    NULL)
ON CONFLICT (email) DO UPDATE SET
  application_date = EXCLUDED.application_date,
  notes            = COALESCE(EXCLUDED.notes, waitlist.notes),
  created_at       = EXCLUDED.created_at;
