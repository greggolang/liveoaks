-- 064: sync member list from CourtReserve export (2026-05)
--
-- Rules:
--   • Rows without an email address are skipped (no login possible).
--   • The system admin account (courtreserve@liveoakstennis.com) is skipped.
--   • For existing accounts (matched on email) only first_name / last_name
--     are updated — password, role, and status are left untouched.
--   • New accounts get the default password: LiveOaks2026!
--     (bcrypt hash: $2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.)
--   • Emails are normalised to lowercase first to avoid case-sensitivity
--     duplicates (PostgreSQL TEXT UNIQUE is case-sensitive by default).
--
-- Name corrections applied from the CSV vs the original seed:
--   Thomas  Carter  → Tom Carter
--   D.Scott Carlton → Scott Carlton
--   Michael Williamson (eileenwilliamson@mac.com) → Eileen Williamson
--   Jeffrey Rosenberg → Jeff Rosenberg
--   Pete    Wilson  → Peter Wilson
--   Charlie Perry   → Charles Perry
--   Amy Davis Jones → Amy Jones
--   Shirley Jagels  now uses rosymischief@gmail.com (updated in source system)

-- Step 1: normalise all existing emails to lowercase.
UPDATE users SET email = LOWER(email) WHERE email != LOWER(email);

-- Step 2: upsert every member with an email address from the CourtReserve export.
--         ON CONFLICT only touches first_name / last_name; role and password are preserved.
INSERT INTO users (first_name, last_name, email, password_hash, role, status)
VALUES
  -- ── A ──────────────────────────────────────────────────────────────
  ('Art',          'Acosta',       'artacos15@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('David',        'Adelstein',    'dsadelstein@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Bob',          'Altman',       'bob@mcsxperts.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Beth',         'Altman',       'bbka@att.net',                       '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── B ──────────────────────────────────────────────────────────────
  ('Mustapha',     'Baha',         'mbaha@att.net',                      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Mariathilde',  'Batoon',       'mpb1st@yahoo.com',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('John',         'Bea',          'jgbea@msn.com',                      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Matthew',      'Bickell',      'mdbickell@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Oren',         'Bitan',        'orenbitan@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Rachel',       'Bitan',        'rachelmira@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Rick',         'Brandley',     'rickb@georgesshowroom.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Linda',        'Brandley',     'lindalbrandley@aol.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jordan',       'Brown',        'jordanbrown2023@gmail.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Christyne',    'Burdett',      'christyne.ink@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── C ──────────────────────────────────────────────────────────────
  ('Paul',         'Cabot',        'paul.cabot@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Liz',          'Cabot',        'elizabeth.ortiz1988@gmail.com',      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Scott',        'Carlton',      'dsc262001@yahoo.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Tom',          'Carter',       'tmc505@me.com',                      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Michele',      'Carter',       'mvtcarter@me.com',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('John',         'Carter',       'jecarter1999@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Grace',        'Carter',       'elisabethcarter0@icloud.com',        '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Art',          'Chen',         'arthurkchen@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('David',        'Chian',        'davechian@yahoo.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Fran',         'Cholko',       'fcholko1945@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Dianne',       'Ciulla',       'ciaociulla@earthlink.net',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Chris',        'Condit',       'ccondit@traderjoes.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Terence',      'Cuff',         'tcuff@loeb.com',                     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── D ──────────────────────────────────────────────────────────────
  ('YunYun',       'Dai',          'daiyunyun@hotmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Arman',        'Davtyan',      'adavtyan_2000@yahoo.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Dave',         'de Csepel',    'dave@veritasri.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Pip',          'de Csepel',    'puffinpip3@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Lila',         'de Csepel',    'lilabird88@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sonny',        'DeGuzman',     'sonnyd6@mac.com',                    '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Josiah',       'DeGuzman',     'josiah_shea_dg@icloud.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Stephanie',    'Dencik',       'stephanie@dencik.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Leo',          'Dencik',       'leo@dencik.com',                     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── E ──────────────────────────────────────────────────────────────
  ('Warren',       'Elgort',       'elgort@usc.edu',                     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Warren',       'Elgort',       'warren.elgort@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── F ──────────────────────────────────────────────────────────────
  ('Laura',        'Ferguson',     'lauraferguson77@gmail.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jonathan',     'Fernandez',    'jdfern007@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Theo',         'Fernandez',    'theodore.k.fernandez@gmail.com',     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Benji',        'Fernandez',    'benjif@stanford.edu',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Gabe',         'Fitch',        'gabefitch@yahoo.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Kevin',        'Frasier',      'kgf@h-finc.com',                     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── G ──────────────────────────────────────────────────────────────
  ('Joanna',       'Gardner',      'joannag64@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Peter',        'Gertmenian',   'pgertmenian@gertmenian.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Stephanie',    'Ginn',         'stephaniesginn@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Charles',      'Ginn',         'charlesdginn@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Vanessa',      'Godson',       'vanessagodson@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Stephen',      'Godwin',       'sjgodwin@me.com',                    '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── H ──────────────────────────────────────────────────────────────
  ('Amber',        'Haley',        'amberhaley@me.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Patrick',      'Haley',        'phaley@me.com',                      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Garrett',      'Haley',        'garretthaleyy@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Matt',         'Hansen',       'matthewshansen@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Michael',      'Henderson',    'mchenderson92@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Fernando',     'Hernandez',    'fernalma96@hotmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jack',         'Horne',        'jacksonhorne@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Greg',         'Howard',       'greg@howardsmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'admin',  'active'),
  ('Ashton',       'Howard',       'courtreserve@howardsmail.com',       '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jenifer',      'Howard',       'courtreserve2@howardsmail.com',      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Angela',       'Hsu',          'angelahsumd@hotmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Ming',         'Hsu',          'mshsu1@yahoo.com',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Shihyen',      'Hsu',          'shihyenh@hotmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Chun Ming',    'Huang',        'chunming76@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── I ──────────────────────────────────────────────────────────────
  ('Josey',        'Iannotti',     'joseyeletters@yahoo.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── J ──────────────────────────────────────────────────────────────
  ('Shirley',      'Jagels',       'rosymischief@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jerri',        'Johnson',      'jjohnson@murchisonlaw.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Kristofer',    'Johnson',      'kristofer.j.johnson@gmail.com',      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Amy',          'Jones',        'amydavisjones@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Leland',       'Jones',        'lmj@endeavourcapital.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Leland',       'Jones',        'lmj1716@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── K ──────────────────────────────────────────────────────────────
  ('Mark',         'Kane',         'mark.c.kane@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Luda',         'Kane',         'luda.kane@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Dan',          'Kanemoto',     'dkanemoto@aol.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sajan',        'Kashyap',      'sajan@kashyaplaw.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('William',      'Ko',           'williamkois@yahoo.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sarah Rogers', 'Krappman',     'sarah@sarahrogersestates.com',       '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jesse',        'Kreger',       'jessemkreger@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── L ──────────────────────────────────────────────────────────────
  ('Leonard',      'Lee',          'leonardlee73@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Kim',          'Luk',          'kimluk3@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Adam',         'Ludwin',       'aludwin@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Samira',       'Ludwin',       'samirag@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Kevin',        'Lutz',         'kevinmlutz@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── M ──────────────────────────────────────────────────────────────
  ('Hilary',       'MacGregor',    'hilaryemacgregor@gmail.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jennifer',     'Madden',       'jenmadden@me.com',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Rick',         'Madden',       'rickmadden@yahoo.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Wei',          'Ma',           'wweeiimm@yahoo.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Cecil',        'Mamiit',       'cvmamiit@gmail.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sean',         'Manion',       'seancmanion@hotmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sandy',        'Manion',       'sandramanion@msn.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jack',         'Manion',       'jackcmanion@hotmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Luke',         'Manion',       'lukecmanion@hotmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Steve',        'Marrs',        'stevetriciamarrs@gmail.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Stephen',      'Marsh',        'stevesuemarsh@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Steve',        'Marsh',        'smarsh@cbank.com',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Darrell',      'Mavis',        'persuasivespeaking@gmail.com',       '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Mira',         'Mavis',        'persuasivelyspeaking@gmail.com',     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('DJ',           'Mavis',        'lada1991@hotmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Harper',       'McDonald',     'harpermcd@yahoo.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Mark',         'Messana',      'messanamark@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Ann',          'Messana',      'messana.ann@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Wade',         'Metzler',      'wmnumber13@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Bill',         'Michels',      'bill.j.michels@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Anne',         'Michels',      'anne.michels427@gmail.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Alex',         'Michels',      'alex.t.michels@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Will',         'Michels',      'will.m.michels@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Ed',           'Morales',      'edwardjmorales@aol.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Andrea',       'Moriarty',     'andibeall@yahoo.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sean',         'Moriarty',     'sean.p.moriarty@gmail.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Rich',         'Muirhead',     'rich@rtmuirhead.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── N ──────────────────────────────────────────────────────────────
  ('Florence',     'Nelson',       'fnelson82@hotmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Eric',         'Neu',          'neueric@hotmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Brian',        'Newhall',      'bnewhall@oxy.edu',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Amy',          'Newhall',      'amymn5@gmail.com',                   '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Rachel',       'Newhall',      'rachel.newhall@yahoo.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('David',        'Newhall',      'davidyn9@gmail.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Emily',        'Newhall',      'emilyflora9@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jeffrey',      'Normile',      'liveoakstennis@yahoo.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── O ──────────────────────────────────────────────────────────────
  ('Khanh',        'Oberley',      'khanh.oberley@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Michael',      'Ortiz',        'mbortiz8@gmail.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Thomas',       'Ortiz',        'ortiz1t@earthlink.net',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── P ──────────────────────────────────────────────────────────────
  ('Linda',        'Park',         'lindapark333@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sam',          'Park',         'pastsam@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Carissa',      'Park',         'carissalpark@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Kenny',        'Pedroza',      'kpedroza@colepedroza.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Christine',    'Pedroza',      'cpedroza@colepedroza.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Charles',      'Perry',        'davidcharlesinc@yahoo.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Stephanie',    'Perry',        'stephaniestevieperry@gmail.com',     '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Julian',       'Petrillo',     'julian.petrillo@icloud.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Monika',       'Petrillo',     'monika.petrillo@icloud.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Louisa',       'Petrillo',     'louisapetrillo19@gmail.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Ben',          'Petrillo',     'ben.petrillo@icloud.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('John',         'Pettersson',   'johnpettersson@yahoo.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('John',         'Proulx',       'john@johnproulx.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Joshua',       'Proulx',       'johnproulx@icloud.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── R ──────────────────────────────────────────────────────────────
  ('Nancy',        'Ray',          'nancychenray@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jed',          'Reagan',       'jedreagan@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jodi',         'Reagan',       'jodilynnwilliams@gmail.com',         '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Duane',        'Rhetta',       'duane.rhetta@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Roberto',      'Roizenblatt',  'robertoeyemd@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Jeff',         'Rosenberg',    'roseyyy@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Michelle',     'Round',        'choniqueen@aol.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Tom',          'Round',        'tomround@gmail.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── S ──────────────────────────────────────────────────────────────
  ('Joyce',        'Sakonju',      'joycesakonju@yahoo.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Marianne',     'Samson',       'wahlen63samson@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Mindy',        'Sato',         'satomommy@aol.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Leilani',      'Scholtz',      'leilanis515@gmail.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Paul',         'Scholtz',      'scholtzy33@gmail.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Blair',        'Slattery',     'blairslattery@hotmail.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Paul',         'Stern',        'paul.stern@att.net',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── T ──────────────────────────────────────────────────────────────
  ('Daniel',       'Takeyama',     'daniel.takeyama@gmail.com',          '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sharon',       'Takeyama',     'sharontakeyama@gmail.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Sen',          'Tan',          'tsk0555@gmail.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Keane',        'Tarrosa',      'tarrosa@oxy.edu',                    '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Keane',        'Tarrosa',      'keane.tarrosa@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Christopher',  'Tayback',      'christayback@quinnemanuel.com',      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Andrea',       'Tieng',        'andrea88@gmail.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Katie',        'Tong',         'ktong34@yahoo.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Myron',        'Tong',         'mjtsp@aol.com',                      '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Dhaval',       'Trivedi',      'loombam@yahoo.com',                  '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Dhaval',       'Trivedi',      'dtrivedi22@yahoo.com',               '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── V ──────────────────────────────────────────────────────────────
  ('Ken',          'Van Amringe',  'kenvanam5@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── W ──────────────────────────────────────────────────────────────
  ('Elizabeth',    'Walters',      'ewalters91108@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Andy',         'Walters',      'ajwalters3794@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Andrew',       'Wiens',        'andrew.wiens@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Kevin',        'Williams',     'giftedlosers@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Eileen',       'Williamson',   'eileenwilliamson@mac.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Scott',        'Winnie',       'scottwinnie10@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Peter',        'Wilson',       'petewilson@aol.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── Y ──────────────────────────────────────────────────────────────
  ('Doug',         'Yokomizo',     'dyokomizo@outlook.com',              '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Cara',         'Yokomizo',     'yokomizocara@gmail.com',             '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('David',        'Younger',      'davidhyounger@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Reno',         'Yu',           'renoyu@hotmail.com',                 '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  -- ── Z ──────────────────────────────────────────────────────────────
  ('Stephen',      'Zeiss',        'stephen.zeiss@google.com',           '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Stephen',      'Zeiss',        'stephen.zeiss@gmail.com',            '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active'),
  ('Erica',        'Zenn',         'ericazenn@gmail.com',                '$2a$10$/y2s6QfM2ChqhSfx/4DSW.fmz55aV3RBg.RqqJok.2/if7qKxoRL.', 'member', 'active')
ON CONFLICT (email) DO UPDATE
  SET first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      updated_at = NOW();

-- Note: Kenny Pedroza (kpedroza@colepedroza.com) and Christine Pedroza
-- (cpedroza@colepedroza.com) share the same email domain but are distinct
-- people with distinct email addresses — both inserted above.
--
-- Members NOT included (no email address in the export, cannot log in):
--   Alma Rosa Hernandez, Manisha Trivedi (x2), Susi/Molly/Owen Pettersson,
--   Jan/Ashley/Chris Sakonju, Guylene Johnson, Tricia Marrs, Cary Horne,
--   Thea/Natalie/Desmond Huang, Marilyn/Rider/Arrow Metzler, Kelly Park,
--   Emmalani/Koloe DeGuzman, Katherine Ma, Aariv/Suri Trivedi (x2),
--   Kailey Sato, Connor/Griffin Ray, Jake Sherwindt, Kadence Chian,
--   Hunter/Aiden Hsu, Marlow Slattery, Anna Proulx/Maya Proulx,
--   Baron Lutz, M Hansen, Zoe Carlton, Tommy/William/Kathryn Ortiz,
--   and several other children/spouses without email on file.
