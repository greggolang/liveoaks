-- A private Files folder for each board-member role.
-- Each folder is visible only to that role (admins always see every folder).
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING so it is safe to re-run on
-- every deploy.

INSERT INTO document_folders (id, name, sort_order) VALUES
    ('00000000-0000-0000-0000-0000000000b1', 'President',       10),
    ('00000000-0000-0000-0000-0000000000b2', 'Vice President',  11),
    ('00000000-0000-0000-0000-0000000000b3', 'Secretary',       12),
    ('00000000-0000-0000-0000-0000000000b4', 'Treasurer',       13),
    ('00000000-0000-0000-0000-0000000000b5', 'Entertainment',   14),
    ('00000000-0000-0000-0000-0000000000b6', 'House & Grounds', 15),
    ('00000000-0000-0000-0000-0000000000b7', 'Billing',         16),
    ('00000000-0000-0000-0000-0000000000b8', 'Membership',      17),
    ('00000000-0000-0000-0000-0000000000b9', 'USTA',            18)
ON CONFLICT (id) DO NOTHING;

INSERT INTO document_folder_roles (folder_id, role) VALUES
    ('00000000-0000-0000-0000-0000000000b1', 'president'),
    ('00000000-0000-0000-0000-0000000000b2', 'vice_president'),
    ('00000000-0000-0000-0000-0000000000b3', 'secretary'),
    ('00000000-0000-0000-0000-0000000000b4', 'treasurer'),
    ('00000000-0000-0000-0000-0000000000b5', 'entertainment'),
    ('00000000-0000-0000-0000-0000000000b6', 'house_grounds'),
    ('00000000-0000-0000-0000-0000000000b7', 'billing'),
    ('00000000-0000-0000-0000-0000000000b8', 'membership'),
    ('00000000-0000-0000-0000-0000000000b9', 'usta')
ON CONFLICT (folder_id, role) DO NOTHING;
