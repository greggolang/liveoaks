ALTER TABLE tennis_ladders
  ADD COLUMN IF NOT EXISTS challenge_frequency_days INTEGER NOT NULL DEFAULT 0;
