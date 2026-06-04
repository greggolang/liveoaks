-- 110: the test mail domain moved from webgoserver.com to the company domain
-- dropshot.company. Migrations 075/084 already seeded the old addresses on
-- existing installs, and the migration runner won't re-run them, so rename the
-- existing test mailboxes here. Idempotent: after it runs once no rows match.
--
-- mail_accounts.address is unique. If the dropshot.company equivalent already
-- exists (e.g. the Stalwart setup workflow re-ran the edited 075 seed), drop the
-- stale webgoserver.com row instead of renaming it into a duplicate-key error.
DELETE FROM mail_accounts w
WHERE w.address LIKE '%@webgoserver.com'
  AND EXISTS (
    SELECT 1 FROM mail_accounts d
    WHERE d.address = replace(w.address, '@webgoserver.com', '@dropshot.company')
  );

UPDATE mail_accounts
SET address = replace(address, '@webgoserver.com', '@dropshot.company')
WHERE address LIKE '%@webgoserver.com';
