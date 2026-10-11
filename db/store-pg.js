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
      const reg = await client()`SELECT to_regclass('public.users') AS t`;
      if (!reg[0].t) {
        // One statement per call: the HTTP driver rejects multi-statement strings.
        const stmts = fs.readFileSync(path.join(__dirname, "..", "schema-pg.sql"), "utf8")
          .split(";").map((s) => s.trim()).filter(Boolean);
        for (const s of stmts) await client()(s);
      }
    })();
  }
  return ready;
}
async function q(text, params = []) {
  await ensureSchema();
  return client()(text, params);
}
const num = (v) => (typeof v === "string" ? Number(v) : v);

async function findUserByEmail(email) {
  const r = await q("SELECT * FROM users WHERE email = $1", [email]);
  return r[0] || null;
}
async function findUserById(id) {
  const r = await q("SELECT id, email, productive_period FROM users WHERE id = $1", [id]);
  return r[0] || null;
}
async function createUser(email, hash, now) {
  const r = await q("INSERT INTO users (email, password_hash, created_at) VALUES ($1,$2,$3) RETURNING id", [email, hash, now]);
  return r[0].id;
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
async function updateActivity(aid, { text, priority, effort_min, status, position }) {
  await q(
    `UPDATE activities SET text=COALESCE($1,text), priority=COALESCE($2,priority),
     effort_min=COALESCE($3,effort_min), status=COALESCE($4,status), position=COALESCE($5,position) WHERE id=$6`,
    [text ?? null, priority ?? null, effort_min ?? null, status ?? null, position ?? null, aid]
  );
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

module.exports = {
  client, ensureSchema,
  findUserByEmail, findUserById, createUser, listSessions, createSession, getSession,
  setPreference, historyCounts, listActivities, maxPosition, insertActivity,
  getActivityInSession, getActivityOwnedBy, getActivityById, updateActivity, deleteActivity,
  getPlanBySession, createPlan, clearPlanItems, addPlanItem, listPlanItems,
  getPlanItemOwned, updatePlanItem, getPlanItemById, createFocus, getFocusOwned,
  endFocus, getFocusById, reviewCounts, unfinishedInSession, markCarried, latestOpenFocus,
};
