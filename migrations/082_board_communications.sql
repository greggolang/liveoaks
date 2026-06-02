-- Permanent board communications log.
-- Records are written at send-time so role changes never affect history:
-- a member who leaves the board keeps their logged records, and a new member
-- starts accumulating records the moment they join.
CREATE TABLE board_communications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comm_type    TEXT NOT NULL CHECK (comm_type IN ('message', 'alert', 'meeting')),
    source_id    UUID NOT NULL,
    subject      TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    from_name    TEXT NOT NULL DEFAULT '',
    from_email   TEXT NOT NULL DEFAULT '',
    to_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    to_name      TEXT NOT NULL DEFAULT '',
    to_email     TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (comm_type, source_id)
);

CREATE INDEX idx_board_comms_created   ON board_communications(created_at DESC);
CREATE INDEX idx_board_comms_type      ON board_communications(comm_type);
CREATE INDEX idx_board_comms_from_user ON board_communications(from_user_id) WHERE from_user_id IS NOT NULL;
CREATE INDEX idx_board_comms_to_user   ON board_communications(to_user_id)   WHERE to_user_id   IS NOT NULL;
