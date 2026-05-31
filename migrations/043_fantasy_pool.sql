-- Fantasy Tennis Pool Management System
CREATE TABLE fantasy_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    year INT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'draft', -- draft | open | locked | completed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fantasy_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('M', 'W')),
    country TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracks which members have joined the pool
CREATE TABLE fantasy_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_paid BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- One row per (participant, tournament, slot). Slot = M1|M2|W1|W2
CREATE TABLE fantasy_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES fantasy_tournaments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
    pick_slot TEXT NOT NULL CHECK (pick_slot IN ('M1', 'M2', 'W1', 'W2')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, tournament_id, pick_slot)
);

-- Admin enters each player's result + prize money after each tournament
CREATE TABLE fantasy_player_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES fantasy_tournaments(id) ON DELETE CASCADE,
    result TEXT NOT NULL CHECK (result IN ('R1','R2','R3','R4','QF','SF','F','Champion')),
    prize_money NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE(player_id, tournament_id)
);
