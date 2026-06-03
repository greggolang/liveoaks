-- 103: profile photos for the member directory. Stores the avatar image's
-- filename on the user; the file lives under uploads/avatars and is served at
-- /uploads/avatars/<filename>. NULL means fall back to the initials avatar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_filename TEXT;
