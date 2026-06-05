-- Tennis Ladder v2: player status, streaks, match formats, score workflow, audit log

-- Enhance player entries with status, streaks, activity tracking
ALTER TABLE tennis_ladder_entries
  ADD COLUMN IF NOT EXISTS player_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_match_date DATE,
  ADD COLUMN IF NOT EXISTS date_joined DATE NOT NULL DEFAULT CURRENT_DATE;

-- Enhance challenges with match format, scheduling, and score approval workflow
ALTER TABLE tennis_challenges
  ADD COLUMN IF NOT EXISTS match_format TEXT NOT NULL DEFAULT 'best_of_3',
  ADD COLUMN IF NOT EXISTS match_date DATE,
  ADD COLUMN IF NOT EXISTS match_time TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS score_status TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS score_submitted_by UUID REFERENCES users(id);

-- Admin action audit log
CREATE TABLE IF NOT EXISTS tennis_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id UUID REFERENCES tennis_ladders(id) ON DELETE SET NULL,
    admin_id UUID NOT NULL REFERENCES users(id),
    admin_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target_user_id UUID REFERENCES users(id),
    target_name TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player conduct records (warnings, suspensions)
CREATE TABLE IF NOT EXISTS tennis_player_conduct (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id UUID NOT NULL REFERENCES tennis_ladders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'warning',  -- warning | suspension
    reason TEXT NOT NULL DEFAULT '',
    issued_by UUID NOT NULL REFERENCES users(id),
    issued_by_name TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Change response_window_hours default to 48 for new ladders
ALTER TABLE tennis_ladders ALTER COLUMN response_window_hours SET DEFAULT 48;

-- Update existing active ladders to 48h response window if still at old default
UPDATE tennis_ladders SET response_window_hours = 48 WHERE response_window_hours = 72 AND status = 'active';
