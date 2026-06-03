-- Add optional time-of-day window to YoLink alert rules.
-- Both columns store "HH:MM" (24-hour). NULL on either = no restriction.
-- When both are set the rule only fires while the local server clock is
-- inside [active_start_time, active_end_time).  Overnight windows work:
-- e.g. start=22:00 end=06:00 fires between 10 pm and 6 am.
ALTER TABLE yolink_alert_rules
    ADD COLUMN IF NOT EXISTS active_start_time TEXT,
    ADD COLUMN IF NOT EXISTS active_end_time   TEXT;
