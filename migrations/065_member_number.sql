-- 065: add unique member_number to each user
--
-- Existing users are assigned numbers starting at 1001, ordered
-- alphabetically (last_name, first_name) to match the admin list view.
-- New users automatically get the next number in the sequence.

CREATE SEQUENCE member_number_seq START 1001;

-- Add nullable so we can backfill first.
ALTER TABLE users ADD COLUMN member_number INT UNIQUE;

-- Assign sequential numbers to all existing users.
WITH ordered AS (
  SELECT id,
         1000 + ROW_NUMBER() OVER (ORDER BY last_name, first_name, created_at) AS num
  FROM users
)
UPDATE users u
SET member_number = o.num
FROM ordered o
WHERE u.id = o.id;

-- Advance the sequence past the highest assigned number so the next
-- INSERT picks up cleanly.
SELECT setval('member_number_seq', (SELECT MAX(member_number) FROM users));

-- Now lock it down.
ALTER TABLE users ALTER COLUMN member_number SET NOT NULL;
ALTER TABLE users ALTER COLUMN member_number SET DEFAULT nextval('member_number_seq');
