-- 108: retrieval index for the "Ask the Club" assistant. Each document is
-- extracted to text and split into chunks; a full-text (tsvector) index lets the
-- assistant pull only the relevant excerpts per question, so it scales to a large
-- document library without stuffing whole files into every prompt.
CREATE TABLE IF NOT EXISTS doc_chunks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT         NOT NULL,
    content     TEXT        NOT NULL,
    tsv         tsvector    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_chunks_tsv_idx ON doc_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS doc_chunks_doc_idx ON doc_chunks (document_id);

-- Marks when a document was last extracted/indexed (NULL = needs indexing).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ;
