// Postgres backend for the shared async store interface (hosted runs, e.g. Neon).
// Same relational logic as store-sqlite.js; `?` becomes positional `$n`,
// inserts use RETURNING id, COUNT(*) comes back as text and is Number()-ed.
const fs = require("fs");
const path = require("path");

let sql = null;
function client() {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const { neon } = require("@neondatabase/serverless");
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

let ready = null;
async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const reg = await client()`SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name='users'`;
      if (!reg[0]) {
        // One statement per call: the HTTP driver rejects multi-statement strings.
        // Strip full-line comments first so embedded semicolons can't split mid-statement.
        const src = fs.readFileSync(path.join(__dirname, "..", "schema-pg.sql"), "utf8")
          .split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
        const stmts = src.split(";").map((s) => s.trim()).filter(Boolean);
        for (const s of stmts) await client().query(s);
      }
      // Idempotent upgrades for databases created by older schema versions.
      // Legacy sessions keep NULL day_date and never conflict on the unique index.
      const colNames = async (table) => {
        const rows = await client()`SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name=${table}`;
        return new Set(rows.map((c) => c.column_name));
      };
      const sessNames = await colNames("planning_sessions");
      if (!sessNames.has("day_date")) await client().query("ALTER TABLE planning_sessions ADD COLUMN day_date TEXT");
      if (!sessNames.has("start_time")) await client().query("ALTER TABLE planning_sessions ADD COLUMN start_time TEXT");
      await client().query("CREATE UNIQUE INDEX IF NOT EXISTS ux_session_user_date ON planning_sessions(user_id, day_date)");
      const actNames = await colNames("activities");
      if (!actNames.has("deadline")) await client().query("ALTER TABLE activities ADD COLUMN deadline TEXT");
      if (!actNames.has("notes")) await client().query("ALTER TABLE activities ADD COLUMN notes TEXT");
      if (!actNames.has("depends_on")) await client().query("ALTER TABLE activities ADD COLUMN depends_on INTEGER REFERENCES activities(id) ON DELETE SET NULL");
      if (!actNames.has("priority_source")) await client().query("ALTER TABLE activities ADD COLUMN priority_source TEXT");
      const userNames = await colNames("users");
      if (!userNames.has("work_start")) await client().query("ALTER TABLE users ADD COLUMN work_start TEXT");
      if (!userNames.has("work_end")) await client().query("ALTER TABLE users ADD COLUMN work_end TEXT");
      await client().query(`CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at BIGINT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      )`);
      await client().query("CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id)");
    })();
  }
  return ready;
}
async function q(text, params = []) {
  await ensureSchema();
  return client().query(text, params);
}
const num = (v) => (typeof v === "string" ? Number(v) : v);

async function findUserByEmail(email) {
  const r = await q("SELECT * FROM users WHERE email = $1", [email]);
  return r[0] || null;
}
async function findUserById(id) {
  const r = await q("SELECT id, email, productive_period, work_start, work_end FROM users WHERE id = $1", [id]);
  return r[0] || null;
}
async function updateUserSettings(uid, { productive_period, work_start, work_end }) {
  const PERIODS = ["morning", "afternoon", "evening", "night"];
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const sets = [];
  const vals = [];
  let n = 0;
  const push = (col, v) => { n += 1; sets.push(`${col}=$${n}`); vals.push(v); };
  if (productive_period !== undefined) {
    if (!PERIODS.includes(productive_period)) throw new Error("Bad period.");
    push("productive_period", productive_period);
  }
  for (const [col, t] of [["work_start", work_start], ["work_end", work_end]]) {
    if (t !== undefined) {
      if (t !== null && !TIME_RE.test(t)) throw new Error("Bad time.");
      push(col, t);
    }
  }
  if (!sets.length) return;
  vals.push(uid);
  await q(`UPDATE users SET ${sets.join(", ")} WHERE id=$${n + 1}`, vals);
}
async function createUser(email, hash, now) {
  const r = await q("INSERT INTO users (email, password_hash, created_at) VALUES ($1,$2,$3) RETURNING id", [email, hash, now]);
  return r[0].id;
}
async function updateUserPassword(uid, hash) {
  await q("UPDATE users SET password_hash=$1 WHERE id=$2", [hash, uid]);
}
async function listSessions(uid) {
  return q("SELECT * FROM planning_sessions WHERE user_id = $1 ORDER BY id DESC", [uid]);
}
async function createSession(uid, day, now) {
  const r = await q("INSERT INTO planning_sessions (user_id, day, created_at) VALUES ($1,$2,$3) RETURNING id", [uid, day, now]);
  return r[0].id;
}
async function getSession(id, uid) {
  const r = await q("SELECT * FROM planning_sessions WHERE id = $1 AND user_id = $2", [id, uid]);
  return r[0] || null;
}
async function setPreference(uid, period) {
  await q("UPDATE users SET productive_period = $1 WHERE id = $2", [period, uid]);
}
async function historyCounts(uid) {
  const r = await q(
    `SELECT session_id, status, COUNT(*) AS n FROM activities
     WHERE session_id IN (SELECT id FROM planning_sessions WHERE user_id = $1)
     GROUP BY session_id, status`,
    [uid]
  );
  return r.map((x) => ({ session_id: x.session_id, status: x.status, n: num(x.n) }));
}
async function listActivities(sid) {
  return q("SELECT * FROM activities WHERE session_id = $1 ORDER BY position, id", [sid]);
}
async function maxPosition(sid) {
  const r = await q("SELECT COALESCE(MAX(position), -1) AS m FROM activities WHERE session_id = $1", [sid]);
  return num(r[0].m);
}
async function insertActivity(sid, text, priority, effort, pos) {
  const r = await q(
    "INSERT INTO activities (session_id, text, priority, effort_min, position) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [sid, text, priority, effort, pos]
  );
  return r[0].id;
}
async function getActivityInSession(aid, sid) {
  const r = await q("SELECT * FROM activities WHERE id = $1 AND session_id = $2", [aid, sid]);
  return r[0] || null;
}
async function getActivityOwnedBy(aid, uid) {
  const r = await q(
    `SELECT a.* FROM activities a JOIN planning_sessions s ON s.id=a.session_id WHERE a.id=$1 AND s.user_id=$2`,
    [aid, uid]
  );
  return r[0] || null;
}
async function getActivityById(aid) {
  const r = await q("SELECT * FROM activities WHERE id = $1", [aid]);
  return r[0] || null;
}
async function updateActivity(aid, { text, priority, effort_min, status, position, deadline, notes, depends_on, priority_source }) {
  const sets = [];
  const vals = [];
  let n = 0;
  const set = (col, v) => { n += 1; sets.push(`${col}=$${n}`); vals.push(v); };
  if (text !== undefined && text !== null) set("text", text);
  if (priority !== undefined && priority !== null) set("priority", priority);
  if (effort_min !== undefined && effort_min !== null) set("effort_min", effort_min);
  if (status !== undefined && status !== null) set("status", status);
  if (position !== undefined && position !== null) set("position", position);
  if (deadline !== undefined) set("deadline", deadline);
  if (notes !== undefined) set("notes", notes === null ? null : String(notes).slice(0, 1000));
  if (depends_on !== undefined) set("depends_on", depends_on);
  if (priority_source !== undefined && priority_source !== null) set("priority_source", priority_source);
  if (!sets.length) return;
  vals.push(aid);
  await q(`UPDATE activities SET ${sets.join(", ")} WHERE id=$${n + 1}`, vals);
}
async function deleteActivity(aid) {
  await q("DELETE FROM activities WHERE id=$1", [aid]);
}
async function getPlanBySession(sid) {
  const r = await q("SELECT * FROM plans WHERE session_id=$1", [sid]);
  return r[0] || null;
}
async function createPlan(sid, now) {
  const r = await q("INSERT INTO plans (session_id, created_at) VALUES ($1,$2) RETURNING id", [sid, now]);
  return r[0].id;
}
async function clearPlanItems(planId) {
  await q("DELETE FROM plan_items WHERE plan_id=$1", [planId]);
}
async function addPlanItem(planId, aid, start, end, pos) {
  const r = await q(
    "INSERT INTO plan_items (plan_id, activity_id, start_time, end_time, position) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [planId, aid, start, end, pos]
  );
  return r[0].id;
}
async function listPlanItems(planId) {
  return q(
    `SELECT pi.id AS plan_item_id, pi.start_time, pi.end_time, pi.position, a.* FROM plan_items pi
     JOIN activities a ON a.id=pi.activity_id WHERE pi.plan_id=$1 ORDER BY pi.position`,
    [planId]
  );
}
async function getPlanItemOwned(piid, uid) {
  const r = await q(
    `SELECT pi.* FROM plan_items pi
     JOIN plans p ON p.id=pi.plan_id
     JOIN planning_sessions s ON s.id=p.session_id
     WHERE pi.id=$1 AND s.user_id=$2`,
    [piid, uid]
  );
  return r[0] || null;
}
async function updatePlanItem(piid, { start_time, end_time, position }) {
  await q(
    "UPDATE plan_items SET start_time=COALESCE($1,start_time), end_time=COALESCE($2,end_time), position=COALESCE($3,position) WHERE id=$4",
    [start_time ?? null, end_time ?? null, position ?? null, piid]
  );
}
async function getPlanItemById(piid) {
  const r = await q("SELECT * FROM plan_items WHERE id=$1", [piid]);
  return r[0] || null;
}
async function createFocus(aid, started, dur) {
  const r = await q("INSERT INTO focus_sessions (activity_id, started_at, duration_min) VALUES ($1,$2,$3) RETURNING id", [aid, started, dur]);
  return r[0].id;
}
async function getFocusOwned(fid, uid) {
  const r = await q(
    `SELECT f.* FROM focus_sessions f JOIN activities a ON a.id=f.activity_id
     JOIN planning_sessions s ON s.id=a.session_id WHERE f.id=$1 AND s.user_id=$2`,
    [fid, uid]
  );
  return r[0] || null;
}
async function endFocus(fid, ended, elapsed) {
  await q("UPDATE focus_sessions SET ended_at=$1, duration_min=$2 WHERE id=$3", [ended, elapsed, fid]);
}
async function getFocusById(fid) {
  const r = await q("SELECT * FROM focus_sessions WHERE id=$1", [fid]);
  return r[0] || null;
}
async function reviewCounts(sid) {
  const r = await q("SELECT status, COUNT(*) AS n FROM activities WHERE session_id=$1 GROUP BY status", [sid]);
  return r.map((x) => ({ status: x.status, n: num(x.n) }));
}
async function unfinishedInSession(sid) {
  return q(
    `SELECT * FROM activities WHERE session_id=$1 AND status IN ('Not Started','In Progress','Partially Completed','Not Completed') ORDER BY position, id`,
    [sid]
  );
}
async function markCarried(sid) {
  await q(
    `UPDATE activities SET status='Carried Forward' WHERE session_id=$1 AND status IN ('Not Started','In Progress','Partially Completed','Not Completed')`,
    [sid]
  );
}
async function latestOpenFocus(sid) {
  const r = await q(
    `SELECT f.* FROM focus_sessions f JOIN activities a ON a.id=f.activity_id
     WHERE a.session_id=$1 AND f.ended_at IS NULL ORDER BY f.id DESC LIMIT 1`,
    [sid]
  );
  return r[0] || null;
}
// Reliably recorded minutes: only finished focus sessions count (evidence-based).
async function focusMinutesBySession(sid) {
  const rows = await q(
    `SELECT a.id AS activity_id, COALESCE(SUM(f.duration_min), 0) AS mins
     FROM activities a LEFT JOIN focus_sessions f ON f.activity_id = a.id AND f.ended_at IS NOT NULL
     WHERE a.session_id = $1 GROUP BY a.id`,
    [sid]
  );
  const out = {};
  for (const r of rows) out[r.activity_id] = num(r.mins);
  return out;
}

// Race-safe find-or-create via the UNIQUE(user_id, day_date) index:
// concurrent callers converge on a single row.
async function findOrCreateSessionByDate(uid, day, dayDate, startTime, now) {
  const existing = await findSessionByDate(uid, dayDate);
  if (existing) return { row: existing, created: false };
  const ins = await q(
    `INSERT INTO planning_sessions (user_id, day, day_date, start_time, created_at)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, day_date) DO NOTHING RETURNING *`,
    [uid, day, dayDate, startTime, now]
  );
  if (ins[0]) return { row: ins[0], created: true };
  return { row: await findSessionByDate(uid, dayDate), created: false };
}
async function findSessionByDate(uid, dayDate) {
  const r = await q("SELECT * FROM planning_sessions WHERE user_id=$1 AND day_date=$2", [uid, dayDate]);
  return r[0] || null;
}
async function setSessionStart(sid, uid, startTime) {
  const s = await getSession(sid, uid);
  if (!s) return null;
  await q("UPDATE planning_sessions SET start_time=$1 WHERE id=$2", [startTime, sid]);
  const r = await q("SELECT * FROM planning_sessions WHERE id=$1", [sid]);
  return r[0] || null;
}
async function bulkInsertActivities(sid, items) {
  const max = await maxPosition(sid);
  const out = [];
  let i = 0;
  for (const it of items) {
    const id = await insertActivity(sid, it.text, it.priority, it.effort_min, max + 1 + i);
    out.push({ id, ...it });
    i++;
  }
  return out;
}
async function createResetToken(uid, hash, expiresAt, now) {
  const r = await q(
    "INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES ($1,$2,$3,$4) RETURNING id",
    [uid, hash, expiresAt, now]
  );
  return r[0].id;
}
async function findResetTokenByHash(hash) {
  const r = await q("SELECT * FROM password_resets WHERE token_hash=$1", [hash]);
  return r[0] || null;
}
async function markResetUsed(id, now) {
  await q("UPDATE password_resets SET used_at=$1 WHERE id=$2", [now, id]);
}
async function deleteUserResetTokens(uid) {
  await q("DELETE FROM password_resets WHERE user_id=$1", [uid]);
}
async function deleteExpiredResets(nowMs) {
  await q("DELETE FROM password_resets WHERE expires_at < $1", [nowMs]);
}

module.exports = {
  client, ensureSchema,
  findUserByEmail, findUserById, createUser, updateUserPassword, updateUserSettings, listSessions, createSession, getSession,
  setPreference, historyCounts, listActivities, maxPosition, insertActivity,
  getActivityInSession, getActivityOwnedBy, getActivityById, updateActivity, deleteActivity,
  getPlanBySession, createPlan, clearPlanItems, addPlanItem, listPlanItems,
  getPlanItemOwned, updatePlanItem, getPlanItemById, createFocus, getFocusOwned,
  endFocus, getFocusById, reviewCounts, unfinishedInSession, markCarried, latestOpenFocus, focusMinutesBySession,
  findOrCreateSessionByDate, findSessionByDate, setSessionStart, bulkInsertActivities,
  createResetToken, findResetTokenByHash, markResetUsed, deleteUserResetTokens, deleteExpiredResets,
};
