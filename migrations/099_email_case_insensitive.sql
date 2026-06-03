-- 099: prevent duplicate registrations that differ only in email case.
-- A registration could previously create a second account with the same address
-- in different case (e.g. foo@x.com and Foo@x.com). Normalise existing emails to
-- lowercase, then enforce uniqueness on lower(email) so it can't happen again.
-- (Idempotent: the UPDATE is a no-op once everything is lowercase, and the index
-- uses IF NOT EXISTS.)
UPDATE users SET email = lower(email) WHERE email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email));
