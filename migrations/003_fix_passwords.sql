-- Regenerate all password hashes using pgcrypto (server-side bcrypt)
-- This ensures compatibility between PostgreSQL and Go's bcrypt implementation
UPDATE users SET password_hash = crypt('LiveOaks2026!', gen_salt('bf', 10));
