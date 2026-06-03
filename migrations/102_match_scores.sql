-- 102: tennis match scorecards. A reported match is tied to the booking it was
-- played on (singles/doubles only) and holds the set scores, the winning side,
-- and a visibility flag (public = club-wide scoreboard, private = participants
-- only). Participants are split into two sides (1 vs 2); singles has one player
-- per side, doubles two. A participant may be a member (user_id) or a guest.
CREATE TABLE IF NOT EXISTS matches (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    UUID        REFERENCES bookings(id) ON DELETE SET NULL,
    match_type    TEXT        NOT NULL,                       -- 'singles' | 'doubles'
    court_name    TEXT,
    played_at     TIMESTAMPTZ NOT NULL,                       -- when the match was played (booking start)
    visibility    TEXT        NOT NULL DEFAULT 'public',      -- 'public' | 'private'
    winner_side   SMALLINT    NOT NULL,                       -- 1 or 2
    sets          JSONB       NOT NULL,                       -- [{"a":6,"b":4},{"a":7,"b":6,"tba":7,"tbb":5}]
    score_summary TEXT        NOT NULL,                       -- "6-4 3-6 7-6(5)" from side 1's perspective
    reported_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One scorecard per booking (re-submitting replaces the prior one in code).
CREATE UNIQUE INDEX IF NOT EXISTS matches_booking_idx ON matches (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matches_visibility_idx ON matches (visibility, played_at DESC);

CREATE TABLE IF NOT EXISTS match_participants (
    match_id  UUID     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    side      SMALLINT NOT NULL,                              -- 1 or 2
    position  SMALLINT NOT NULL,                              -- 1 or 2 within a side
    user_id   UUID     REFERENCES users(id) ON DELETE SET NULL,
    name      TEXT     NOT NULL,
    is_guest  BOOLEAN  NOT NULL DEFAULT false,
    PRIMARY KEY (match_id, side, position)
);
CREATE INDEX IF NOT EXISTS match_participants_user_idx ON match_participants (user_id);
