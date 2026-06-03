-- Per-mailbox IMAP filter rules. Each rule belongs to one mail_account and is
-- evaluated every 5 minutes (and on demand) by the mail-filter runner, which
-- moves / deletes / marks-read matching messages.
CREATE TABLE IF NOT EXISTS mail_filter_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
    name          TEXT NOT NULL DEFAULT '',
    enabled       BOOLEAN NOT NULL DEFAULT true,
    match_field   TEXT NOT NULL DEFAULT 'from',   -- from | to_cc | subject | body
    pattern       TEXT NOT NULL,                  -- case-insensitive substring
    source_folder TEXT NOT NULL DEFAULT 'INBOX',
    action        TEXT NOT NULL DEFAULT 'move',   -- move | delete | mark_read
    dest_folder   TEXT NOT NULL DEFAULT '',       -- required when action = 'move'
    matched_count INTEGER NOT NULL DEFAULT 0,     -- cumulative lifetime matches acted on
    last_run_at   TIMESTAMPTZ,
    last_error    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_account ON mail_filter_rules(account_id);
