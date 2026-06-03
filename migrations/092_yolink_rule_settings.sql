-- Extended settings for the YoLink alert rule engine.
--
-- active_days: bitmask of weekdays the rule may fire.
--   bit 0 (1)  = Sunday
--   bit 1 (2)  = Monday
--   bit 2 (4)  = Tuesday
--   bit 3 (8)  = Wednesday
--   bit 4 (16) = Thursday
--   bit 5 (32) = Friday
--   bit 6 (64) = Saturday
--   NULL / 0   = any day (no restriction)
--
-- cooldown_minutes: suppress repeat firings of this rule within N minutes
--   of the last time it actually sent a notification.  NULL = no cooldown.
--   last_fired_at is managed by the service, not the admin UI.
--
-- priority: lower integer = evaluated first.  Rules with stop_processing=true
--   halt evaluation of lower-priority rules once they match and fire.
--
-- notes: free-text description visible only in the admin UI.

ALTER TABLE yolink_alert_rules
    ADD COLUMN IF NOT EXISTS priority          INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS active_days       INTEGER,
    ADD COLUMN IF NOT EXISTS cooldown_minutes  INTEGER,
    ADD COLUMN IF NOT EXISTS last_fired_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stop_processing   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS notes             TEXT;
