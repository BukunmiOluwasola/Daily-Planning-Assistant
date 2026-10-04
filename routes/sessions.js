// Planning sessions, productive-period preference, history. All scoped to the signed-in user.
const express = require("express");
const db = require("../db/db");

const router = express.Router();
const now = () => new Date().toISOString();
const PERIODS = ["morning", "afternoon", "evening", "night"];

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  next();
}
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM planning_sessions WHERE user_id = ? ORDER BY id DESC")
    .all(req.session.userId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const day = req.body && req.body.day;
  if (!["today", "tomorrow"].includes(day)) {
    return res.status(400).json({ error: "day must be 'today' or 'tomorrow'." });
  }
  const info = db
    .prepare("INSERT INTO planning_sessions (user_id, day, created_at) VALUES (?,?,?)")
    .run(req.session.userId, day, now());
  res.status(201).json({ id: info.lastInsertRowid, day });
});

router.get("/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM planning_sessions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: "Session not found." });
  row.activities = db
    .prepare("SELECT * FROM activities WHERE session_id = ? ORDER BY position, id")
    .all(row.id);
  res.json(row);
});

router.put("/preference", (req, res) => {
  const period = req.body && req.body.productive_period;
  if (!PERIODS.includes(period)) {
    return res.status(400).json({ error: "productive_period must be morning/afternoon/evening/night." });
  }
  db.prepare("UPDATE users SET productive_period = ? WHERE id = ?").run(
    period,
    req.session.userId
  );
  res.json({ productive_period: period });
});

// History: past sessions with per-status counts.
router.get("/history/all", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM planning_sessions WHERE user_id = ? ORDER BY id DESC")
    .all(req.session.userId);
  const counts = db
    .prepare(
      `SELECT session_id, status, COUNT(*) AS n FROM activities
       WHERE session_id IN (SELECT id FROM planning_sessions WHERE user_id = ?)
       GROUP BY session_id, status`
    )
    .all(req.session.userId);
  const bySession = {};
  for (const c of counts) {
    (bySession[c.session_id] = bySession[c.session_id] || []).push({ status: c.status, n: c.n });
  }
  res.json(rows.map((s) => ({ ...s, activity_counts: bySession[s.id] || [] })));
});

module.exports = router;
