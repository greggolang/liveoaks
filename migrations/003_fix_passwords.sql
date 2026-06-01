-- One-time historical fix: ensure every account has a bcrypt hash that Go's
-- bcrypt can verify (server-side pgcrypto bcrypt is compatible).
--
-- IMPORTANT: the deploy re-applies ALL migration files on every deploy, so this
-- statement MUST be idempotent and MUST NOT clobber passwords members have set.
-- It originally ran `UPDATE users SET password_hash = crypt('LiveOaks2026!', …)`
-- with no WHERE clause, which reset EVERY member's password to the default on
-- every single deploy. It is now scoped to only backfill accounts that have no
-- usable bcrypt hash; any account with a real hash (starting with `$2`) — i.e.
-- the seeded default or a password the member chose — is left untouched.
UPDATE users
SET password_hash = crypt('LiveOaks2026!', gen_salt('bf', 10))
WHERE password_hash IS NULL
   OR password_hash = ''
   OR password_hash NOT LIKE '$2%';
