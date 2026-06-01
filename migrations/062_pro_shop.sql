CREATE TABLE IF NOT EXISTS pro_shop_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    category    TEXT NOT NULL DEFAULT 'other',
    emoji       TEXT NOT NULL DEFAULT '🛍️',
    in_stock    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The deploy re-applies every migration on every deploy, so the default-item
-- seed below must run EXACTLY ONCE. Previously it re-inserted any default item
-- whenever it was missing, so items an admin deleted reappeared after every
-- software update. The seed is now gated on a one-time 'pro_shop_seeded' flag.

-- Existing installs already have the default items — mark them as already
-- seeded so the one-time seed never re-adds anything (including deleted items).
INSERT INTO settings (key, value)
SELECT 'pro_shop_seeded', 'true'
WHERE EXISTS (SELECT 1 FROM pro_shop_items)
ON CONFLICT (key) DO NOTHING;

-- One-time seed of default items — only on a brand-new install (flag absent).
INSERT INTO pro_shop_items (name, description, price, category, emoji, sort_order)
SELECT v.name, v.description, v.price, v.category, v.emoji, v.sort_order
FROM (VALUES
    ('Water',             'Bottled water, 16.9 oz',     1.50, 'drinks', '💧', 10),
    ('Sports Drink',      'Gatorade, assorted flavors', 2.50, 'drinks', '🥤', 20),
    ('Soda',              'Coke, Diet Coke, or Sprite', 2.00, 'drinks', '🥫', 30),
    ('Energy Drink',      'Red Bull, 8.4 oz',           3.50, 'drinks', '⚡', 40),
    ('Penn Championship', 'Regular duty, can of 3',     5.00, 'balls',  '🎾', 10),
    ('Wilson US Open',    'Extra duty, can of 3',       5.50, 'balls',  '🎾', 20)
) AS v(name, description, price, category, emoji, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'pro_shop_seeded');

-- Record that the seed has run so it never runs again.
INSERT INTO settings (key, value) VALUES ('pro_shop_seeded', 'true')
ON CONFLICT (key) DO NOTHING;
