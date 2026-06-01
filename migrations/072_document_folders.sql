-- Document folders with role-based visibility
CREATE TABLE IF NOT EXISTS document_folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    sort_order  INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which roles can see a folder. No rows = visible to all members.
CREATE TABLE IF NOT EXISTS document_folder_roles (
    folder_id   UUID NOT NULL REFERENCES document_folders(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    PRIMARY KEY (folder_id, role)
);

-- Link documents to folders
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL;

-- Seed a default General folder (idempotent)
INSERT INTO document_folders (id, name, sort_order)
VALUES ('00000000-0000-0000-0000-000000000001', 'General', 0)
ON CONFLICT DO NOTHING;

-- Move all existing unfiled documents into the General folder
UPDATE documents SET folder_id = '00000000-0000-0000-0000-000000000001' WHERE folder_id IS NULL;
