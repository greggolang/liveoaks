-- Password storage for Google Workspace role mailboxes (interim credential management)
INSERT INTO settings (key, value) VALUES
  ('google_pass_president',      ''),
  ('google_pass_vice_president',  ''),
  ('google_pass_secretary',       ''),
  ('google_pass_treasurer',       ''),
  ('google_pass_billing',         ''),
  ('google_pass_entertainment',   ''),
  ('google_pass_house_grounds',   ''),
  ('google_pass_usta',            ''),
  ('google_pass_admin',           '')
ON CONFLICT (key) DO NOTHING;
