ALTER TABLE document_folders
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE;
