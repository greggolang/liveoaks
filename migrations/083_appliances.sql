CREATE TABLE appliances (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT        NOT NULL,
    location             TEXT,
    brand                TEXT,
    model_number         TEXT,
    serial_number        TEXT,
    installed_date       DATE,
    notes                TEXT,
    manual_filename      TEXT,
    manual_original_name TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appliance_service_records (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    appliance_id UUID        NOT NULL REFERENCES appliances(id) ON DELETE CASCADE,
    service_date DATE        NOT NULL,
    service_type TEXT        NOT NULL DEFAULT 'maintenance',
    description  TEXT,
    technician   TEXT,
    cost         NUMERIC(10,2),
    created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON appliance_service_records (appliance_id, service_date DESC);

CREATE TABLE appliance_reminders (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    appliance_id    UUID        NOT NULL REFERENCES appliances(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    due_date        DATE        NOT NULL,
    recurrence_days INT,
    notes           TEXT,
    last_sent_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON appliance_reminders (due_date);
