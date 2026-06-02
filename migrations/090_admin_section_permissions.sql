-- Per-role access control for sections of the admin panel.
-- A row (section, role) means that role may open that admin section. Admins
-- always have full access and are never stored here. Managed from the
-- "Board Access" page (admin only).
CREATE TABLE IF NOT EXISTS admin_section_permissions (
    section TEXT NOT NULL,
    role    TEXT NOT NULL,
    PRIMARY KEY (section, role)
);

-- Seed to preserve current behavior so nothing breaks on deploy:
-- sections that were already available to every board member (boardPlus) are
-- granted to each board role. Admin-only sections (Members, Billing, Settings,
-- Waitlist, etc.) are intentionally left empty — admins keep them implicitly
-- and can grant them to specific roles from the Board Access page.
INSERT INTO admin_section_permissions (section, role)
SELECT s.section, r.role FROM
  (VALUES
    ('events_admin'),('announcements'),('pro_shop'),('files'),('photos'),
    ('usta_teams'),('bookings_admin'),('court_blocks'),('cancellations'),
    ('ball_tracking'),('teaching_pro'),('liveball'),('board_meetings'),
    ('notes'),('appliances'),('yolink'),('kiosk_purchases')
  ) AS s(section),
  (VALUES
    ('president'),('vice_president'),('secretary'),('treasurer'),
    ('billing'),('membership'),('usta'),('entertainment'),
    ('house_grounds'),('games'),('pro')
  ) AS r(role)
ON CONFLICT DO NOTHING;

-- Fantasy admin was available to the dedicated "games" role.
INSERT INTO admin_section_permissions (section, role) VALUES ('fantasy', 'games')
ON CONFLICT DO NOTHING;
