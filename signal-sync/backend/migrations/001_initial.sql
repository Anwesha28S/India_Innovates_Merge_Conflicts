-- SignalSync PostgreSQL Schema
-- Run once to set up all tables.

CREATE TABLE IF NOT EXISTS users (
    firebase_uid    VARCHAR(128) PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(255),
    role            VARCHAR(30)  NOT NULL DEFAULT 'PUBLIC_USER'
                    CHECK (role IN ('PUBLIC_USER','DISPATCHER','ADMIN','VVIP_AUTHORITY')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS intersections (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    city            VARCHAR(100) NOT NULL DEFAULT 'Mumbai',
    default_green   INT NOT NULL DEFAULT 30,
    default_yellow  INT NOT NULL DEFAULT 3,
    default_red     INT NOT NULL DEFAULT 30,
    has_camera      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roads (
    id                      SERIAL PRIMARY KEY,
    from_intersection_id    INT NOT NULL REFERENCES intersections(id) ON DELETE CASCADE,
    to_intersection_id      INT NOT NULL REFERENCES intersections(id) ON DELETE CASCADE,
    distance_m              DOUBLE PRECISION NOT NULL,
    speed_limit_kmh         INT NOT NULL DEFAULT 50,
    is_bidirectional        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS roads_from_idx ON roads(from_intersection_id);
CREATE INDEX IF NOT EXISTS roads_to_idx   ON roads(to_intersection_id);

CREATE TABLE IF NOT EXISTS corridors (
    id               VARCHAR(36)  PRIMARY KEY,
    firebase_uid     VARCHAR(128) NOT NULL REFERENCES users(firebase_uid),
    corridor_type    VARCHAR(30)  NOT NULL DEFAULT 'ambulance'
                     CHECK (corridor_type IN ('ambulance','fire_truck','vvip')),
    status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','completed','aborted')),
    origin_name      VARCHAR(255) NOT NULL,
    dest_name        VARCHAR(255) NOT NULL,
    origin_lat       DOUBLE PRECISION,
    origin_lng       DOUBLE PRECISION,
    dest_lat         DOUBLE PRECISION,
    dest_lng         DOUBLE PRECISION,
    node_ids         JSONB NOT NULL DEFAULT '[]',
    node_snapshot    JSONB NOT NULL DEFAULT '[]',
    active_node_index INT NOT NULL DEFAULT 0,
    priority_level   INT NOT NULL DEFAULT 3 CHECK (priority_level BETWEEN 1 AND 4),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS corridors_uid_idx    ON corridors(firebase_uid);
CREATE INDEX IF NOT EXISTS corridors_status_idx ON corridors(status);

CREATE TABLE IF NOT EXISTS audit_logs (
    id           VARCHAR(36)  PRIMARY KEY,
    firebase_uid VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE SET NULL,
    corridor_id  VARCHAR(36)  REFERENCES corridors(id) ON DELETE SET NULL,
    action       VARCHAR(100) NOT NULL,
    detail       JSONB NOT NULL DEFAULT '{}',
    ip_address   VARCHAR(64),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_uid_idx    ON audit_logs(firebase_uid);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_ts_idx     ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS traffic_logs (
    id               SERIAL PRIMARY KEY,
    intersection_id  INT NOT NULL REFERENCES intersections(id) ON DELETE CASCADE,
    density_pct      INT NOT NULL CHECK (density_pct BETWEEN 0 AND 100),
    vehicle_count    INT NOT NULL DEFAULT 0,
    signal_state     VARCHAR(30),
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tlog_intersection_idx ON traffic_logs(intersection_id);
CREATE INDEX IF NOT EXISTS tlog_ts_idx           ON traffic_logs(recorded_at DESC);

-- ── Seed: sample Mumbai intersections ────────────────────────────────────────
INSERT INTO intersections (name, lat, lng, city, has_camera) VALUES
  ('Andheri Junction',       19.1197, 72.8464, 'Mumbai', true),
  ('Bandra Linking Road',    19.0596, 72.8295, 'Mumbai', true),
  ('Dadar TT Circle',        19.0213, 72.8422, 'Mumbai', false),
  ('CSMT Junction',          18.9398, 72.8354, 'Mumbai', true),
  ('Thane Station Square',   19.1870, 72.9634, 'Mumbai', false)
ON CONFLICT DO NOTHING;

INSERT INTO roads (from_intersection_id, to_intersection_id, distance_m, speed_limit_kmh, is_bidirectional)
SELECT f.id, t.id, 8500, 60, true
FROM intersections f, intersections t
WHERE f.name = 'Andheri Junction' AND t.name = 'Bandra Linking Road'
ON CONFLICT DO NOTHING;

INSERT INTO roads (from_intersection_id, to_intersection_id, distance_m, speed_limit_kmh, is_bidirectional)
SELECT f.id, t.id, 6200, 50, true
FROM intersections f, intersections t
WHERE f.name = 'Bandra Linking Road' AND t.name = 'Dadar TT Circle'
ON CONFLICT DO NOTHING;

INSERT INTO roads (from_intersection_id, to_intersection_id, distance_m, speed_limit_kmh, is_bidirectional)
SELECT f.id, t.id, 9100, 60, true
FROM intersections f, intersections t
WHERE f.name = 'Dadar TT Circle' AND t.name = 'CSMT Junction'
ON CONFLICT DO NOTHING;
