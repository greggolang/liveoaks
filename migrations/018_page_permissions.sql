CREATE TABLE page_permissions (
    page TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (page, role)
);

-- Default: all roles can access all pages
INSERT INTO page_permissions (page, role)
SELECT p.page, r.role FROM
  (VALUES
    ('bookings'),('court_grid'),('events'),('announcements'),
    ('documents'),('photos'),('usta_teams'),('directory'),
    ('guests'),('dues'),('club_info')
  ) AS p(page),
  (VALUES
    ('admin'),('president'),('vice_president'),('secretary'),('treasurer'),
    ('entertainment'),('house_grounds'),('billing'),('membership'),('usta'),('member')
  ) AS r(role);
