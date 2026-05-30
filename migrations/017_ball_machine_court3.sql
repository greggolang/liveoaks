-- Remove ball machine as a separate court
DELETE FROM courts WHERE number = 5;

-- Add ball machine flag to courts table
ALTER TABLE courts ADD COLUMN IF NOT EXISTS has_ball_machine BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark Court 3 as having the ball machine
UPDATE courts SET has_ball_machine = TRUE WHERE number = 3;

-- Remove the type column added in migration 013 (no longer needed)
ALTER TABLE courts DROP COLUMN IF EXISTS type;
