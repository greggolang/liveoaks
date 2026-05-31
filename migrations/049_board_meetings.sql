CREATE TABLE board_meeting_invitations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    status     TEXT NOT NULL DEFAULT 'invited'
                   CHECK (status IN ('invited', 'accepted', 'declined')),
    responded_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_board_meeting_invitations_event ON board_meeting_invitations (event_id);
CREATE INDEX idx_board_meeting_invitations_user  ON board_meeting_invitations (user_id);
