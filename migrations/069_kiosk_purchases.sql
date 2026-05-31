-- 069: pro shop kiosk purchases
-- Records self-service purchases made on the club iPad kiosk.
-- Denormalises item name/price at purchase time so the record is stable
-- even if the item is later edited or removed from the catalogue.

CREATE TABLE pro_shop_purchases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     UUID REFERENCES pro_shop_items(id) ON DELETE SET NULL,
    item_name   TEXT NOT NULL,
    item_price  NUMERIC(10,2) NOT NULL,
    quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total       NUMERIC(10,2) NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pro_shop_purchases_user_idx  ON pro_shop_purchases (user_id, created_at DESC);
CREATE INDEX pro_shop_purchases_date_idx  ON pro_shop_purchases (created_at DESC);
