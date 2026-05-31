-- 067: member-to-member direct messages
CREATE TABLE member_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject          TEXT NOT NULL DEFAULT '',
    body             TEXT NOT NULL,
    reply_to         UUID REFERENCES member_messages(id) ON DELETE SET NULL,
    -- Read receipt: set when the recipient first opens the message
    read_at          TIMESTAMPTZ,
    -- Soft-delete so each party sees their own view
    deleted_by_sender    BOOLEAN NOT NULL DEFAULT false,
    deleted_by_recipient BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX member_messages_recipient_idx ON member_messages (recipient_id, created_at DESC);
CREATE INDEX member_messages_sender_idx    ON member_messages (sender_id,    created_at DESC);
