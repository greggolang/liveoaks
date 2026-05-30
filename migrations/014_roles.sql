-- Convert role and status from ENUM to TEXT for flexibility

ALTER TABLE users ADD COLUMN role_new TEXT NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN status_new TEXT NOT NULL DEFAULT 'pending';

UPDATE users SET role_new = role::TEXT, status_new = status::TEXT;

ALTER TABLE users DROP COLUMN role;
ALTER TABLE users DROP COLUMN status;

ALTER TABLE users RENAME COLUMN role_new TO role;
ALTER TABLE users RENAME COLUMN status_new TO status;

DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS user_status;

-- Migrate existing 'board' role to 'member' (admins can reassign specific roles)
UPDATE users SET role = 'member' WHERE role = 'board';
