-- LiveBall event invitations (first-come-first-served, token-based RSVP)
-- Uses the existing events table (event_type = 'liveball', max_players = spots needed)

CREATE TABLE liveball_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'invited',  -- invited | confirmed | waitlisted | declined | cancelled
    token TEXT NOT NULL UNIQUE,              -- for email-link RSVP
    position INT,                            -- roster slot (1 = first to confirm, etc.)
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(event_id, user_id)
);

CREATE INDEX liveball_invitations_event_id ON liveball_invitations(event_id);
CREATE INDEX liveball_invitations_token ON liveball_invitations(token);
