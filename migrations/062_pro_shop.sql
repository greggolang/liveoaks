CREATE TABLE pro_shop_items (
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

INSERT INTO pro_shop_items (name, description, price, category, emoji, sort_order) VALUES
    ('Water',              'Bottled water, 16.9 oz',       1.50, 'drinks', '💧', 10),
    ('Sports Drink',       'Gatorade, assorted flavors',   2.50, 'drinks', '🥤', 20),
    ('Soda',               'Coke, Diet Coke, or Sprite',   2.00, 'drinks', '🥫', 30),
    ('Energy Drink',       'Red Bull, 8.4 oz',             3.50, 'drinks', '⚡', 40),
    ('Penn Championship',  'Regular duty, can of 3',       5.00, 'balls',  '🎾', 10),
    ('Wilson US Open',     'Extra duty, can of 3',         5.50, 'balls',  '🎾', 20);
