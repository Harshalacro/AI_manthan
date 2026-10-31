-- Iris database schema for Postgres (Neon).
--
-- Generated from the table definitions in the backend code, converted with
-- app/pgcompat.translate(). The app creates these tables itself on startup
-- (CREATE TABLE IF NOT EXISTS), so running this file is optional; it is here
-- to read, or to create an empty database by hand:
--
--     psql "$DATABASE_URL" -f backend/db/schema.sql
--
-- No data is included. Timestamps and JSON documents are stored as TEXT.

-- ------------------------------------------------------------
-- Risk engine (app/store.py)

CREATE TABLE IF NOT EXISTS runs (
    id           BIGSERIAL PRIMARY KEY,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    trigger      TEXT NOT NULL,
    status       TEXT NOT NULL,
    locations    INTEGER DEFAULT 0,
    duration_ms  INTEGER,
    notes        TEXT
);

CREATE TABLE IF NOT EXISTS location_state (
    location_id  TEXT NOT NULL,
    run_id       INTEGER NOT NULL,
    computed_at  TEXT NOT NULL,
    score        DOUBLE PRECISION NOT NULL,
    tier         TEXT NOT NULL,
    confidence   DOUBLE PRECISION NOT NULL,
    payload      TEXT NOT NULL,
    PRIMARY KEY (location_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_location_state_run ON location_state(run_id);

CREATE TABLE IF NOT EXISTS observations (
    location_id  TEXT NOT NULL,
    date         TEXT NOT NULL,
    kind         TEXT NOT NULL,
    value        DOUBLE PRECISION,
    horizon      TEXT NOT NULL,
    run_id       INTEGER NOT NULL,
    PRIMARY KEY (location_id, date, kind, horizon)
);

CREATE TABLE IF NOT EXISTS climatology (
    location_id  TEXT PRIMARY KEY,
    built_at     TEXT NOT NULL,
    start_year   INTEGER NOT NULL,
    end_year     INTEGER NOT NULL,
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    stats        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_health (
    source       TEXT PRIMARY KEY,
    checked_at   TEXT NOT NULL,
    ok           INTEGER NOT NULL,
    latency_ms   INTEGER,
    detail       TEXT
);

-- ------------------------------------------------------------
-- Accounts (app/auth.py)

CREATE TABLE IF NOT EXISTS users (
    username    TEXT PRIMARY KEY,
    pw_hash     TEXT NOT NULL,
    role        TEXT NOT NULL,
    state       TEXT,
    district    TEXT,
    created_at  TEXT NOT NULL,
    name        TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- ------------------------------------------------------------
-- Alerts (app/notify.py)

CREATE TABLE IF NOT EXISTS notify_prefs (
    username     TEXT PRIMARY KEY,
    role         TEXT NOT NULL,
    state        TEXT,
    district     TEXT,
    name         TEXT,
    email        TEXT,
    whatsapp     TEXT,
    phone        TEXT,
    channels     TEXT NOT NULL,
    min_level    TEXT NOT NULL DEFAULT 'orange',
    daily_brief  INTEGER NOT NULL DEFAULT 1,
    enabled      INTEGER NOT NULL DEFAULT 1,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notify_sent (
    username   TEXT NOT NULL,
    alert_id   TEXT NOT NULL,
    place_id   TEXT,
    level      TEXT,
    sent_at    TEXT NOT NULL,
    cleared    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (username, alert_id)
);

CREATE TABLE IF NOT EXISTS notify_log (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    username    TEXT NOT NULL,
    event       TEXT NOT NULL,
    title       TEXT,
    channels    TEXT,
    status      TEXT NOT NULL,
    detail      TEXT
);

CREATE TABLE IF NOT EXISTS notify_meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- ------------------------------------------------------------
-- Response plan (app/planning.py)

CREATE TABLE IF NOT EXISTS plan_runs (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    trigger     TEXT NOT NULL,
    run_id      INTEGER,
    body        TEXT NOT NULL
);

-- ------------------------------------------------------------
-- Depots and stock (app/resources.py)

CREATE TABLE IF NOT EXISTS res_depots (
    id        TEXT PRIMARY KEY,
    kind      TEXT NOT NULL,
    name      TEXT NOT NULL,
    state     TEXT NOT NULL,
    district  TEXT,
    place_id  TEXT,
    lat       DOUBLE PRECISION NOT NULL,
    lon       DOUBLE PRECISION NOT NULL,
    source    TEXT
);

CREATE TABLE IF NOT EXISTS res_stock (
    depot_id    TEXT NOT NULL,
    rtype       TEXT NOT NULL,
    total       INTEGER NOT NULL,
    demo        INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL,
    updated_by  TEXT,
    PRIMARY KEY (depot_id, rtype)
);

CREATE TABLE IF NOT EXISTS res_deployments (
    id           TEXT PRIMARY KEY,
    depot_id     TEXT NOT NULL,
    rtype        TEXT NOT NULL,
    place_id     TEXT NOT NULL,
    count        INTEGER NOT NULL,
    status       TEXT NOT NULL,
    plan_id      TEXT,
    created_at   TEXT NOT NULL,
    created_by   TEXT,
    released_at  TEXT
);
