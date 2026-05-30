CREATE TABLE friend_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE friend_group_members (
    group_id UUID NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, friend_id)
);
