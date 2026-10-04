// Phase 6: focus sessions, break reminders, review summary, carry-forward.
// Statuses follow the PRD: Not Started / In Progress / Completed /
// Partially Completed / Not Completed, plus Carried Forward once moved.
const express = require("express");
const db = require("../db/db");
const { ownSession } = require("../lib/plan");

const router = express.Router();
const now = () => new Date().toISOString();
const UNFINISHED = ["Not Started", "In Progress", "Partially Completed", "Not Completed"];
const BREAK_MSG = "Time for a break — stand up, stretch, rest your eyes, drink water. Then continue.";

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  next();
}
router.use(requireAuth);

// Start a focus session for one activity (default 25 min).
router.post("/sessions/:id/focus", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const { activity_id, duration_min } = req.body || {};
  const a = db.prepare("SELECT * FROM activities WHERE id=? AND session_id=?").get(activity_id, s.id);
  if (!a) return res.status(404).json({ error: "Activity not found." });
  const mins = duration_min === undefined ? 25 : duration_min;
  if (!Number.isInteger(mins) || mins <= 0) return res.status(400).json({ error: "duration_min must be a positive integer." });
  db.prepare("UPDATE activities SET status='In Progress' WHERE id=?").run(a.id);
  const info = db.prepare("INSERT INTO focus_sessions (activity_id, started_at, duration_min) VALUES (?,?,?)").run(a.id, now(), mins);
  res.status(201).json({ id: info.lastInsertRowid, activity_id: a.id, duration_min: mins });
});

// End a focus session; the response carries the break reminder.
router.patch("/focus/:id", (req, res) => {
  const f = db.prepare(
    `SELECT f.* FROM focus_sessions f JOIN activities a ON a.id=f.activity_id
     JOIN planning_sessions s ON s.id=a.session_id WHERE f.id=? AND s.user_id=?`
  ).get(req.params.id, req.session.userId);
  if (!f) return res.status(404).json({ error: "Focus session not found." });
  if (f.ended_at) return res.status(409).json({ error: "Already ended." });
  const ended = now();
  const elapsed = Math.max(1, Math.round((new Date(ended) - new Date(f.started_at)) / 60000));
  db.prepare("UPDATE focus_sessions SET ended_at=?, duration_min=? WHERE id=?").run(ended, elapsed, f.id);
  res.json({ ...db.prepare("SELECT * FROM focus_sessions WHERE id=?").get(f.id), break: BREAK_MSG });
});

// Daily review summary for a session.
router.post("/sessions/:id/review", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM activities WHERE session_id=? GROUP BY status").all(s.id);
  const by_status = {};
  let total = 0;
  for (const r of rows) {
    by_status[r.status] = r.n;
    total += r.n;
  }
  const completed = by_status["Completed"] || 0;
  res.json({ session_id: s.id, total, by_status, completed, remaining: total - completed });
});

// Carry unfinished items into a new session (default: a fresh 'tomorrow' session).
router.post("/sessions/:id/carry-forward", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const day = (req.body && req.body.day) || "tomorrow";
  if (!["today", "tomorrow"].includes(day)) return res.status(400).json({ error: "day must be 'today' or 'tomorrow'." });
  const left = db.prepare(
    `SELECT * FROM activities WHERE session_id=? AND status IN (${UNFINISHED.map(() => "?").join(",")}) ORDER BY position, id`
  ).all(s.id, ...UNFINISHED);
  const tx = db.transaction(() => {
    const ns = db.prepare("INSERT INTO planning_sessions (user_id, day, created_at) VALUES (?,?,?)").run(req.session.userId, day, now());
    const ins = db.prepare("INSERT INTO activities (session_id, text, priority, effort_min, position) VALUES (?,?,?,?,?)");
    left.forEach((a, i) => ins.run(ns.lastInsertRowid, a.text, a.priority, a.effort_min, i));
    db.prepare(`UPDATE activities SET status='Carried Forward' WHERE session_id=? AND status IN (${UNFINISHED.map(() => "?").join(",")})`).run(s.id, ...UNFINISHED);
    return ns.lastInsertRowid;
  })();
  res.status(201).json({ new_session_id: tx, carried: left.length });
});

module.exports = router;
