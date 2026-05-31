ALTER TABLE announcements ADD COLUMN IF NOT EXISTS require_confirmation BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE announcement_reads (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id  UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
    read_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(announcement_id, user_id)
);
