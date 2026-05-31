INSERT INTO settings (key, value) VALUES ('weather_lat', '34.1161') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('weather_lon', '-118.1498') ON CONFLICT (key) DO NOTHING;
