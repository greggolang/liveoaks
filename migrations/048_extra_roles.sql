-- Support multiple role assignments per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_roles TEXT[] NOT NULL DEFAULT '{}';
