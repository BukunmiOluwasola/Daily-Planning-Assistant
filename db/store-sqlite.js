// SQLite backend for the shared async store interface (local runs).
// Synchronous better-sqlite3 wrapped in async functions so routes are
// identical across backends. See store-blobs.js for the Netlify backend.
const db = require("./db");

async function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) || null;
}
async function findUserById(id) {
  return db.prepare("SELECT id, email, productive_period FROM users WHERE id = ?").get(id) || null;
}
async function createUser(email, hash, now) {
  return db.prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?,?,?)").run(email, hash, now)
    .lastInsertRowid;
}
async function listSessions(uid) {
  return db.prepare("SELECT * FROM planning_sessions WHERE user_id = ? ORDER BY id DESC").all(uid);
}
async function createSession(uid, day, now) {
  return db.prepare("INSERT INTO planning_sessions (user_id, day, created_at) VALUES (?,?,?)").run(uid, day, now)
    .lastInsertRowid;
}
async function getSession(id, uid) {
  return db.prepare("SELECT * FROM planning_sessions WHERE id = ? AND user_id = ?").get(id, uid) || null;
}
async function setPreference(uid, period) {
  db.prepare("UPDATE users SET productive_period = ? WHERE id = ?").run(period, uid);
}
async function historyCounts(uid) {
  return db
    .prepare(
      `SELECT session_id, status, COUNT(*) AS n FROM activities
       WHERE session_id IN (SELECT id FROM planning_sessions WHERE user_id = ?)
       GROUP BY session_id, status`
    )
    .all(uid);
}
async function listActivities(sid) {
  return db.prepare("SELECT * FROM activities WHERE session_id = ? ORDER BY position, id").all(sid);
}
async function maxPosition(sid) {
  return db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM activities WHERE session_id = ?").get(sid).m;
}
async function insertActivity(sid, text, priority, effort, pos) {
  return db
    .prepare("INSERT INTO activities (session_id, text, priority, effort_min, position) VALUES (?,?,?,?,?)")
    .run(sid, text, priority, effort, pos).lastInsertRowid;
}
async function getActivityInSession(aid, sid) {
  return db.prepare("SELECT * FROM activities WHERE id = ? AND session_id = ?").get(aid, sid) || null;
}
async function getActivityOwnedBy(aid, uid) {
  return (
    db.prepare(
      `SELECT a.* FROM activities a JOIN planning_sessions s ON s.id=a.session_id WHERE a.id=? AND s.user_id=?`
    ).get(aid, uid) || null
  );
}
async function getActivityById(aid) {
  return db.prepare("SELECT * FROM activities WHERE id = ?").get(aid) || null;
}
async function updateActivity(aid, { text, priority, effort_min, status, position }) {
  db.prepare(
    `UPDATE activities SET text=COALESCE(?,text), priority=COALESCE(?,priority),
     effort_min=COALESCE(?,effort_min), status=COALESCE(?,status), position=COALESCE(?,position) WHERE id=?`
  ).run(text ?? null, priority ?? null, effort_min ?? null, status ?? null, position ?? null, aid);
}
async function deleteActivity(aid) {
  db.prepare("DELETE FROM activities WHERE id=?").run(aid);
}
async function getPlanBySession(sid) {
  return db.prepare("SELECT * FROM plans WHERE session_id=?").get(sid) || null;
}
async function createPlan(sid, now) {
  return db.prepare("INSERT INTO plans (session_id, created_at) VALUES (?,?)").run(sid, now).lastInsertRowid;
}
async function clearPlanItems(planId) {
  db.prepare("DELETE FROM plan_items WHERE plan_id=?").run(planId);
}
async function addPlanItem(planId, aid, start, end, pos) {
  return db
    .prepare("INSERT INTO plan_items (plan_id, activity_id, start_time, end_time, position) VALUES (?,?,?,?,?)")
    .run(planId, aid, start, end, pos).lastInsertRowid;
}
async function listPlanItems(planId) {
  return db
    .prepare(
      `SELECT pi.id AS plan_item_id, pi.start_time, pi.end_time, pi.position, a.* FROM plan_items pi
       JOIN activities a ON a.id=pi.activity_id WHERE pi.plan_id=? ORDER BY pi.position`
    )
    .all(planId);
}
async function getPlanItemOwned(piid, uid) {
  return (
    db.prepare(
      `SELECT pi.* FROM plan_items pi
       JOIN plans p ON p.id=pi.plan_id
       JOIN planning_sessions s ON s.id=p.session_id
       WHERE pi.id=? AND s.user_id=?`
    ).get(piid, uid) || null
  );
}
async function updatePlanItem(piid, { start_time, end_time, position }) {
  db.prepare(
    "UPDATE plan_items SET start_time=COALESCE(?,start_time), end_time=COALESCE(?,end_time), position=COALESCE(?,position) WHERE id=?"
  ).run(start_time ?? null, end_time ?? null, position ?? null, piid);
}
async function getPlanItemById(piid) {
  return db.prepare("SELECT * FROM plan_items WHERE id=?").get(piid) || null;
}
async function createFocus(aid, started, dur) {
  return db.prepare("INSERT INTO focus_sessions (activity_id, started_at, duration_min) VALUES (?,?,?)").run(aid, started, dur)
    .lastInsertRowid;
}
async function getFocusOwned(fid, uid) {
  return (
    db.prepare(
      `SELECT f.* FROM focus_sessions f JOIN activities a ON a.id=f.activity_id
       JOIN planning_sessions s ON s.id=a.session_id WHERE f.id=? AND s.user_id=?`
    ).get(fid, uid) || null
  );
}
async function endFocus(fid, ended, elapsed) {
  db.prepare("UPDATE focus_sessions SET ended_at=?, duration_min=? WHERE id=?").run(ended, elapsed, fid);
}
async function getFocusById(fid) {
  return db.prepare("SELECT * FROM focus_sessions WHERE id=?").get(fid) || null;
}
async function reviewCounts(sid) {
  return db.prepare("SELECT status, COUNT(*) AS n FROM activities WHERE session_id=? GROUP BY status").all(sid);
}
async function unfinishedInSession(sid) {
  return db
    .prepare(
      `SELECT * FROM activities WHERE session_id=? AND status IN ('Not Started','In Progress','Partially Completed','Not Completed') ORDER BY position, id`
    )
    .all(sid);
}
async function markCarried(sid) {
  db.prepare(
    `UPDATE activities SET status='Carried Forward' WHERE session_id=? AND status IN ('Not Started','In Progress','Partially Completed','Not Completed')`
  ).run(sid);
}
async function latestOpenFocus(sid) {
  return (
    db.prepare(
      `SELECT f.* FROM focus_sessions f JOIN activities a ON a.id=f.activity_id
       WHERE a.session_id=? AND f.ended_at IS NULL ORDER BY f.id DESC LIMIT 1`
    ).get(sid) || null
  );
}

module.exports = {
  findUserByEmail, findUserById, createUser, listSessions, createSession, getSession,
  setPreference, historyCounts, listActivities, maxPosition, insertActivity,
  getActivityInSession, getActivityOwnedBy, getActivityById, updateActivity, deleteActivity,
  getPlanBySession, createPlan, clearPlanItems, addPlanItem, listPlanItems,
  getPlanItemOwned, updatePlanItem, getPlanItemById, createFocus, getFocusOwned,
  endFocus, getFocusById, reviewCounts, unfinishedInSession, markCarried, latestOpenFocus,
};
