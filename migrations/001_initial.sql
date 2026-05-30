CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE user_role AS ENUM ('admin', 'board', 'member');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'pending');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'member',
    status user_status NOT NULL DEFAULT 'pending',
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE courts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    number INT NOT NULL UNIQUE
);

INSERT INTO courts (name, number) VALUES
    ('Court 1', 1),
    ('Court 2', 2),
    ('Court 3', 3),
    ('Court 4', 4);

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    court_id INT NOT NULL REFERENCES courts(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_overlap EXCLUDE USING gist (
        court_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    )
);

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'waived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
    ('club_name', 'Liveoaks Tennis Club'),
    ('booking_max_days_ahead', '14'),
    ('booking_max_duration_hours', '2'),
    ('dues_amount', '100.00'),
    ('dues_period', 'annual');
