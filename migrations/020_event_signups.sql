-- Add signup capability to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS signup_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS signup_deadline TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_players INT;

-- Event sign-up responses
CREATE TABLE event_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Section 1: Participant
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    member_status TEXT NOT NULL DEFAULT 'member',

    -- Section 2: Tennis
    playing_tennis BOOLEAN NOT NULL DEFAULT FALSE,
    skill_level TEXT,
    formats TEXT[],
    preferred_partner TEXT,
    willing_substitute BOOLEAN,

    -- Section 3: Lunch
    attending_lunch BOOLEAN NOT NULL DEFAULT FALSE,
    lunch_count INT DEFAULT 1,
    lunch_guest_names TEXT,

    -- Section 4: Potluck
    food_contributions TEXT[],
    food_item TEXT,
    food_servings TEXT,
    food_allergies TEXT,

    -- Section 5: Volunteer
    volunteer_roles TEXT[],
    volunteer_time TEXT,

    -- Section 6: Additional
    emergency_name TEXT,
    emergency_phone TEXT,
    comments TEXT,

    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX event_signups_event_id ON event_signups (event_id);
