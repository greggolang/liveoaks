-- Add separate Google Workspace email setting for the Billing role
INSERT INTO settings (key, value) VALUES
  ('google_email_billing', '')
ON CONFLICT (key) DO NOTHING;
