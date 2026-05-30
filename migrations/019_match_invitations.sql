-- Add match type and player count to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'casual';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS players_needed INT NOT NULL DEFAULT 0;

-- Friends list (members + non-member guests)
CREATE TABLE friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    friend_name TEXT,
    friend_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(member_id, friend_user_id)
);

-- Match invitations
CREATE TABLE match_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invitee_name TEXT NOT NULL,
    invitee_email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Confirmed match roster
CREATE TABLE match_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    invitation_id UUID REFERENCES match_invitations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    player_name TEXT NOT NULL,
    player_email TEXT,
    is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    is_host BOOLEAN NOT NULL DEFAULT FALSE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guest fee settings
INSERT INTO settings (key, value) VALUES
    ('guest_participation_enabled', 'true'),
    ('guest_fee_singles', '10.00'),
    ('guest_fee_doubles', '10.00'),
    ('guest_fee_peak', '15.00'),
    ('guest_fee_offpeak', '10.00'),
    ('peak_hours_start', '08:00'),
    ('peak_hours_end', '18:00')
ON CONFLICT (key) DO NOTHING;
