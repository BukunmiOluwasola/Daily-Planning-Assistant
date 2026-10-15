-- Daily Planning Assistant — Postgres schema (Neon, hosted runs).
-- Same tables and rules as schema.sql; SERIAL keys replace INTEGER PRIMARY KEY.
CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  productive_period TEXT NOT NULL DEFAULT 'night'
    CHECK (productive_period IN ('morning','afternoon','evening','night')),
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planning_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL CHECK (day IN ('today','tomorrow')),
  day_date   TEXT,
  start_time TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  priority   TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high','medium','can-wait')),
  effort_min INTEGER NOT NULL DEFAULT 30 CHECK (effort_min > 0),
  status     TEXT NOT NULL DEFAULT 'Not Started'
    CHECK (status IN ('Not Started','In Progress','Completed','Partially Completed','Not Completed','Carried Forward')),
  position   INTEGER NOT NULL DEFAULT 0,
  deadline   TEXT,
  notes      TEXT,
  depends_on INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  priority_source TEXT
);

CREATE TABLE IF NOT EXISTS plans (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL UNIQUE REFERENCES planning_sessions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_items (
  id          SERIAL PRIMARY KEY,
  plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id           SERIAL PRIMARY KEY,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  duration_min INTEGER NOT NULL DEFAULT 25 CHECK (duration_min > 0)
);

CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON planning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_session ON activities(session_id);
CREATE INDEX IF NOT EXISTS idx_items_plan ON plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_focus_activity ON focus_sessions(activity_id);

-- One planning session per user per calendar date (NULL day_date = legacy, never conflicts).
CREATE UNIQUE INDEX IF NOT EXISTS ux_session_user_date ON planning_sessions(user_id, day_date);

-- Password-reset tokens: only hashes are stored, never raw tokens.
CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);
