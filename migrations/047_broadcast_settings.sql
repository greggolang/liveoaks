-- Seed broadcast email confirmation code (changeable via Admin → Settings)
INSERT INTO settings (key, value) VALUES ('broadcast_confirm_code', 'Ki1ler2600!')
ON CONFLICT (key) DO NOTHING;
