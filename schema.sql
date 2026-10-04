-- Daily Planning Assistant — V1 SQLite schema (Phase 3)
-- Local file database. All timestamps are ISO-8601 TEXT in local time.
-- Priority vocabulary is fixed V1-wide: High / Medium / Can Wait
-- (stored lowercase: 'high', 'medium', 'can-wait').

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  productive_period TEXT NOT NULL DEFAULT 'night'
    CHECK (productive_period IN ('morning','afternoon','evening','night')),
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planning_sessions (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL CHECK (day IN ('today','tomorrow')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id         INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  priority   TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high','medium','can-wait')),
  effort_min INTEGER NOT NULL DEFAULT 30 CHECK (effort_min > 0),
  status     TEXT NOT NULL DEFAULT 'Not Started'
    CHECK (status IN ('Not Started','In Progress','Completed','Partially Completed','Not Completed','Carried Forward')),
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
  id         INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL UNIQUE REFERENCES planning_sessions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_items (
  id          INTEGER PRIMARY KEY,
  plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id           INTEGER PRIMARY KEY,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  duration_min INTEGER NOT NULL DEFAULT 25 CHECK (duration_min > 0)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON planning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_session ON activities(session_id);
CREATE INDEX IF NOT EXISTS idx_items_plan ON plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_focus_activity ON focus_sessions(activity_id);
