CREATE TABLE IF NOT EXISTS yolink_alert_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    -- match conditions (NULL = "any"); all present conditions must match (AND)
    device_id         TEXT,
    device_type       TEXT,
    event_contains    TEXT,
    state_equals      TEXT,
    -- recipients: all_members | board | role | user
    recipient_scope   TEXT NOT NULL DEFAULT 'board',
    recipient_role    TEXT,
    recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    -- channels
    notify_dashboard  BOOLEAN NOT NULL DEFAULT true,
    notify_email      BOOLEAN NOT NULL DEFAULT false,
    notify_sms        BOOLEAN NOT NULL DEFAULT false,
    -- presentation
    alert_type        TEXT NOT NULL DEFAULT 'warning',  -- info | warning | danger
    message_template  TEXT,                             -- supports {device} and {event}
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a default rule that reproduces the previous behavior (any alert → board,
-- dashboard + email) — only when no rules exist yet, so re-runs are safe.
INSERT INTO yolink_alert_rules (name, recipient_scope, notify_dashboard, notify_email, alert_type)
SELECT 'Default — notify board (dashboard + email)', 'board', true, true, 'warning'
WHERE NOT EXISTS (SELECT 1 FROM yolink_alert_rules);
