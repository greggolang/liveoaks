-- Add admin_notes column so the membership board can annotate each request/entry.
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS admin_notes TEXT;
