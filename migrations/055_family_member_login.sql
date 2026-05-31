-- Stores the users.id of a family member's own login account (created when a password is set).
ALTER TABLE family_members
    ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
