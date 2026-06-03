-- 103: give each feedback / bug report a stable sequential number so it can be
-- referenced and searched (e.g. "bug #42").
CREATE SEQUENCE IF NOT EXISTS feedback_number_seq;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS number INT;

-- Backfill existing rows in chronological order.
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
    FROM feedback WHERE number IS NULL
)
UPDATE feedback f SET number = o.rn FROM ordered o WHERE f.id = o.id;

-- Position the sequence so the next insert continues after the highest number
-- (is_called=false makes nextval return the given value), then make it the default.
SELECT setval('feedback_number_seq', (SELECT COALESCE(MAX(number), 0) FROM feedback) + 1, false);
ALTER TABLE feedback ALTER COLUMN number SET DEFAULT nextval('feedback_number_seq');
