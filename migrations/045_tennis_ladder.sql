-- Live Oaks Tennis Ladder & Tournament System

CREATE TABLE tennis_ladders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'singles',        -- singles | doubles
    season_year INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',       -- active | completed | draft
    challenge_range INT NOT NULL DEFAULT 3,      -- spots above you can challenge
    challenge_expiry_days INT NOT NULL DEFAULT 7,
    response_window_hours INT NOT NULL DEFAULT 72,
    play_window_days INT NOT NULL DEFAULT 14,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player profiles / registrations per ladder
CREATE TABLE tennis_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id UUID NOT NULL REFERENCES tennis_ladders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usta_rating TEXT NOT NULL DEFAULT '',
    self_rating NUMERIC(3,1),
    preference TEXT NOT NULL DEFAULT 'singles',  -- singles | doubles | both
    availability TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ladder_id, user_id)
);

-- Current ranked standings
CREATE TABLE tennis_ladder_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id UUID NOT NULL REFERENCES tennis_ladders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank INT NOT NULL,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    season_points INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ladder_id, user_id)
);

-- Challenges between players
CREATE TABLE tennis_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id UUID NOT NULL REFERENCES tennis_ladders(id) ON DELETE CASCADE,
    challenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenged_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenger_rank INT NOT NULL,
    challenged_rank INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | completed | declined | expired | forfeited
    winner_id UUID REFERENCES users(id),
    score TEXT NOT NULL DEFAULT '',          -- e.g. "6-3, 7-5"
    message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,         -- pending acceptance deadline
    respond_by TIMESTAMPTZ NOT NULL,         -- 72h response window
    play_by TIMESTAMPTZ,                     -- set when accepted; 14 days to play
    completed_at TIMESTAMPTZ
);

-- All season points log
CREATE TABLE tennis_season_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ladder_id UUID NOT NULL REFERENCES tennis_ladders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INT NOT NULL,
    source_type TEXT NOT NULL,  -- ladder_win | ladder_loss | volunteer | bonus
    source_id UUID,             -- challenge_id or event_id
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
