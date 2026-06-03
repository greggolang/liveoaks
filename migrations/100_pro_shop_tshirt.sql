-- Add a T-Shirt item to the pro shop.
--
-- The deploy re-applies every migration on every deploy, so this seed must run
-- EXACTLY ONCE — otherwise the T-Shirt would reappear after every deploy even
-- if an admin deletes it. It is gated on a one-time 'pro_shop_tshirt_seeded'
-- flag, the same pattern used by the original pro_shop seed (062).

INSERT INTO pro_shop_items (name, description, price, category, emoji, sort_order)
SELECT 'T-Shirt', 'Club logo t-shirt', 25.00, 'apparel', '👕', 10
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'pro_shop_tshirt_seeded');

-- Record that the seed has run so it never runs again.
INSERT INTO settings (key, value) VALUES ('pro_shop_tshirt_seeded', 'true')
ON CONFLICT (key) DO NOTHING;
