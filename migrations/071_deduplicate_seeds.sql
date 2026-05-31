-- Remove duplicate pro_shop_items created by repeated migration runs.
-- Keeps the oldest row per name; safe to re-run (no-op when no duplicates exist).
DELETE FROM pro_shop_items
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC, id ASC) AS rn
        FROM pro_shop_items
    ) ranked
    WHERE rn > 1
);

-- Remove duplicate booking_cancel_reasons for the same reason.
DELETE FROM booking_cancel_reasons
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY reason ORDER BY created_at ASC, id ASC) AS rn
        FROM booking_cancel_reasons
    ) ranked
    WHERE rn > 1
);
