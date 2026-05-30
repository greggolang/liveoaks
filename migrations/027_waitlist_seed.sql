-- Make email optional for manually-entered entries
ALTER TABLE waitlist ALTER COLUMN email DROP NOT NULL;

-- Add explicit position column to preserve ordering
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS position INT;

-- Seed the April 2026 waitlist in order (skip if already present by name)
INSERT INTO waitlist (first_name, last_name, position, status)
SELECT v.first_name, v.last_name, v.position, 'pending'
FROM (VALUES
  ('Florinda',  'Bailey',        1),
  ('Peter',     'Nowogrodzki',   2),
  ('Debbie',    'Sierra',        3),
  ('Jim',       'Dowd',          4),
  ('Anthony',   'Cannizzo',      5),
  ('Mandy',     'Pardehpoosh',   6),
  ('Felipe',    'Velasquez',     7),
  ('Kristen',   'Harrington',    8),
  ('Jacqueline','Roth',          9),
  ('Cindi',     'Carter',       10),
  ('Monica',    'Clouet',       11),
  ('Alex',      'Blatt',        12),
  ('Karla',     'Thompson',     13),
  ('Aram',      'Hamadi',       14),
  ('Andrea',    'Kretzmann',    15),
  ('Stephen',   'Perkins',      16),
  ('Jill',      'Brenek',       17),
  ('Ayuko',     'Siegel',       18),
  ('Ghia',      'Godfree',      19),
  ('Linda',     'Lyke',         20),
  ('Lorna',     'Kim',          21),
  ('Karen',     'Tamis',        22),
  ('Jeff',      'Neidermeyer',  23),
  ('Hugh',      'Allen',        24),
  ('Bryant',    'Yung',         25),
  ('Rani',      'Ranade',       26),
  ('Isaac',     'George',       27),
  ('Rebecca',   'Hsai',         28),
  ('Stacey',    'Zhao',         29),
  ('Leslie',    'Jiang',        30),
  ('Amy',       'Lyford',       31),
  ('Carol',     'Goldthwait',   32),
  ('Gavin',     'Lau',          33),
  ('John',      'Dam',          34),
  ('Zoro',      'Vartanian',    35),
  ('Kathy',     'Foy-Asaro',    36),
  ('Jay',       'Ho',           37),
  ('Stephanie', 'Chen',         38),
  ('Lisa',      'Paez',         39),
  ('Shayna',    'McKinney',     40),
  ('Rex',       'Sheng',        41),
  ('Kristen',   'Carter',       42),
  ('Loris',     'Memic',        43),
  ('Robert',    'Carter',       44)
) AS v(first_name, last_name, position)
WHERE NOT EXISTS (
  SELECT 1 FROM waitlist w
  WHERE w.first_name = v.first_name AND w.last_name = v.last_name
);
