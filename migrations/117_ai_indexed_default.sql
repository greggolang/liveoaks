-- Enable AI search for all existing documents and make it the default for new uploads.
-- Previously ai_indexed defaulted to false, requiring board members to enable the ✨
-- flag on each document individually. Now every document is AI-searchable based on
-- the folder's role permissions — board members can still exclude specific documents
-- by toggling the ✨ button off.
UPDATE documents SET ai_indexed = true;
ALTER TABLE documents ALTER COLUMN ai_indexed SET DEFAULT true;
