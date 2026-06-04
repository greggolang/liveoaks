-- 111: internal board note on an idea/bug — private triage notes that are NOT
-- shown to the member (distinct from the reply, which is sent to their inbox).
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS note TEXT;
