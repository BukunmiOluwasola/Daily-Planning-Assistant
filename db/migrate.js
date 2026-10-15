// Idempotent SQLite migrations for existing databases.
// Fresh databases are built from schema.sql; this file only ADDS what is
// missing (new columns, indexes, tables). Never alters or backfills old rows:
// legacy sessions keep NULL day_date and never conflict on the unique index.
function migrate(db) {
  const colsOf = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const sessCols = colsOf("planning_sessions");
  const addSess = (name, ddl) => {
    if (!sessCols.includes(name)) db.exec(`ALTER TABLE planning_sessions ADD COLUMN ${ddl}`);
  };
  addSess("day_date", "day_date TEXT");
  addSess("start_time", "start_time TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_session_user_date ON planning_sessions(user_id, day_date)");
  const actCols = colsOf("activities");
  const addAct = (name, ddl) => {
    if (!actCols.includes(name)) db.exec(`ALTER TABLE activities ADD COLUMN ${ddl}`);
  };
  addAct("deadline", "deadline TEXT");
  addAct("notes", "notes TEXT");
  addAct("depends_on", "depends_on INTEGER REFERENCES activities(id) ON DELETE SET NULL");
  addAct("priority_source", "priority_source TEXT");
  const userCols = colsOf("users");
  if (!userCols.includes("work_start")) db.exec("ALTER TABLE users ADD COLUMN work_start TEXT");
  if (!userCols.includes("work_end")) db.exec("ALTER TABLE users ADD COLUMN work_end TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id)");
}

module.exports = { migrate };
