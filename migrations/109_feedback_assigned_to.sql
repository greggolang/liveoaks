-- 109: let admins assign each idea/bug to a board member (Greg, Sean, Ian).
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS assigned_to TEXT;
