INSERT INTO courts (name, number) VALUES ('Ball Machine', 5);

ALTER TABLE courts ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'court';
UPDATE courts SET type = 'ball_machine' WHERE number = 5;

INSERT INTO settings (key, value) VALUES
    ('weather_camera_url', ''),
    ('coaching_bio', 'Professional tennis instruction available. Contact the club for details.'),
    ('coaching_contact', ''),
    ('club_history', 'Founded in 1912, Live Oaks Tennis Association (LOTA) is one of the oldest private tennis clubs in Southern California. The club features four hard courts and a historic 1926 clubhouse in South Pasadena.');
