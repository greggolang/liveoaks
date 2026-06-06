-- Add feedback_id link to member_messages so replies can be traced back to the ticket
ALTER TABLE member_messages ADD COLUMN IF NOT EXISTS feedback_id UUID REFERENCES feedback(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_member_messages_feedback_id ON member_messages(feedback_id) WHERE feedback_id IS NOT NULL;

-- Store the full communication thread for each feedback ticket
CREATE TABLE feedback_replies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID        NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    message_id  UUID        REFERENCES member_messages(id) ON DELETE SET NULL,
    sender_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    sender_name TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    direction   TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_replies_feedback_id ON feedback_replies(feedback_id);
