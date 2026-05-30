-- Role-to-email mappings for Google Workspace integration
INSERT INTO settings (key, value) VALUES
  ('google_email_president',      ''),
  ('google_email_vice_president',  ''),
  ('google_email_secretary',       ''),
  ('google_email_treasurer',       ''),
  ('google_email_entertainment',   ''),
  ('google_email_house_grounds',   ''),
  ('google_email_usta',            ''),
  ('google_email_admin',           '')
ON CONFLICT (key) DO NOTHING;
