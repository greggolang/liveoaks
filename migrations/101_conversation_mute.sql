-- 101: per-participant mute for group conversations. A muted member still sees
-- the conversation and its unread badge, but receives no email notifications.
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;
