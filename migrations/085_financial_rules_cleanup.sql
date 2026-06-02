-- Remove duplicate financial rules, keeping the earliest-created copy of each name.
DELETE FROM financial_rules
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at) AS rn
        FROM financial_rules
    ) t
    WHERE rn > 1
);

-- Prevent future duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS financial_rules_name_key ON financial_rules(name);
