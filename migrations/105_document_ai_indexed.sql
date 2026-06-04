-- 105: let admins choose which uploaded documents the AI assistant may read in
-- full. Default false = the assistant only knows the document's title (index),
-- not its contents. Idempotent.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_indexed BOOLEAN NOT NULL DEFAULT false;
