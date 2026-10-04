// Phase 5a: brain-dump parse, clarification Q&A, activity editing.
// Priority vocabulary: High / Medium / Can Wait (stored lowercase).
const express = require("express");
const db = require("../db/db");
const { guessPriority, guessEffort, hasDeadlineWords, hasTimeMarker, ownSession } = require("../lib/plan");

const router = express.Router();
const PRIORITIES = ["high", "medium", "can-wait"];
const STATUSES = ["Not Started", "In Progress", "Completed", "Partially Completed", "Not Completed", "Carried Forward"];

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  next();
}
router.use(requireAuth);

function withReason(a) {
  return { ...a, reason: guessPriority(a.text).priority === a.priority ? guessPriority(a.text).reason : "Adjusted by you." };
}

// Parse a freeform brain dump into activities (one per non-empty line).
router.post("/sessions/:id/parse", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const text = (req.body && req.body.text) || "";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: "Nothing to parse." });
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM activities WHERE session_id = ?").get(s.id).m;
  const ins = db.prepare("INSERT INTO activities (session_id, text, priority, effort_min, position) VALUES (?,?,?,?,?)");
  const out = [];
  lines.forEach((line, i) => {
    const g = guessPriority(line);
    const info = ins.run(s.id, line, g.priority, guessEffort(line), maxPos + 1 + i);
    out.push({ id: info.lastInsertRowid, text: line, priority: g.priority, reason: g.reason });
  });
  res.status(201).json(out);
});

// Clarification questions generated from what each activity is missing (max 6).
router.get("/sessions/:id/questions", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const acts = db.prepare("SELECT * FROM activities WHERE session_id = ? ORDER BY position, id").all(s.id);
  const qs = [];
  for (const a of acts) {
    if (qs.length >= 6) break;
    if (!hasDeadlineWords(a.text) && a.priority !== "high") {
      qs.push({ activity_id: a.id, text: a.text, key: "deadline", question: `Does "${a.text}" have a deadline?`, options: ["today", "tomorrow", "this-week", "none"] });
    }
    if (qs.length >= 6) break;
    if (!hasTimeMarker(a.text) && a.effort_min === 30) {
      qs.push({ activity_id: a.id, text: a.text, key: "effort", question: `How long will "${a.text}" take?`, options: ["15", "30", "60", "120"] });
    }
    if (qs.length >= 6) break;
    if (a.priority === "medium") {
      qs.push({ activity_id: a.id, text: a.text, key: "mustdo", question: `Must "${a.text}" happen on this day?`, options: ["yes", "no"] });
    }
  }
  res.json(qs.slice(0, 6));
});

// Answer a clarification question; every answer changes state so the question clears.
router.post("/sessions/:id/answers", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const { activity_id, key, value } = req.body || {};
  const a = db.prepare("SELECT * FROM activities WHERE id = ? AND session_id = ?").get(activity_id, s.id);
  if (!a) return res.status(404).json({ error: "Activity not found." });
  if (key === "deadline") {
    if (["today", "tomorrow"].includes(value)) db.prepare("UPDATE activities SET priority='high' WHERE id=?").run(a.id);
    else if (value === "this-week") db.prepare("UPDATE activities SET priority='medium' WHERE id=?").run(a.id);
    else if (value === "none") db.prepare("UPDATE activities SET priority='can-wait' WHERE id=?").run(a.id);
    else return res.status(400).json({ error: "Bad deadline answer." });
  } else if (key === "effort") {
    const mins = parseInt(value, 10);
    if (![15, 30, 60, 120].includes(mins)) return res.status(400).json({ error: "Bad effort answer." });
    db.prepare("UPDATE activities SET effort_min=? WHERE id=?").run(mins, a.id);
  } else if (key === "mustdo") {
    if (value === "yes") db.prepare("UPDATE activities SET priority='high' WHERE id=?").run(a.id);
    else if (value === "no") db.prepare("UPDATE activities SET priority='can-wait' WHERE id=?").run(a.id);
    else return res.status(400).json({ error: "Bad must-do answer." });
  } else {
    return res.status(400).json({ error: "Unknown question." });
  }
  const updated = db.prepare("SELECT * FROM activities WHERE id=?").get(a.id);
  res.json(withReason(updated));
});

router.get("/sessions/:id/activities", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const rows = db.prepare("SELECT * FROM activities WHERE session_id=? ORDER BY position, id").all(s.id);
  res.json(rows.map(withReason));
});

router.patch("/activities/:id", (req, res) => {
  const a = db.prepare(
    `SELECT a.* FROM activities a JOIN planning_sessions s ON s.id=a.session_id WHERE a.id=? AND s.user_id=?`
  ).get(req.params.id, req.session.userId);
  if (!a) return res.status(404).json({ error: "Activity not found." });
  const { text, priority, effort_min, status, position } = req.body || {};
  if (priority !== undefined && !PRIORITIES.includes(String(priority).toLowerCase())) {
    return res.status(400).json({ error: "priority must be High, Medium, or Can Wait." });
  }
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: "Bad status." });
  if (effort_min !== undefined && (!Number.isInteger(effort_min) || effort_min <= 0)) {
    return res.status(400).json({ error: "effort_min must be a positive integer." });
  }
  db.prepare(
    `UPDATE activities SET text=COALESCE(?,text), priority=COALESCE(?,priority),
     effort_min=COALESCE(?,effort_min), status=COALESCE(?,status), position=COALESCE(?,position) WHERE id=?`
  ).run(
    text ?? null,
    priority !== undefined ? String(priority).toLowerCase() : null,
    effort_min ?? null, status ?? null, position ?? null, a.id
  );
  res.json(withReason(db.prepare("SELECT * FROM activities WHERE id=?").get(a.id)));
});

router.delete("/activities/:id", (req, res) => {
  const a = db.prepare(
    `SELECT a.* FROM activities a JOIN planning_sessions s ON s.id=a.session_id WHERE a.id=? AND s.user_id=?`
  ).get(req.params.id, req.session.userId);
  if (!a) return res.status(404).json({ error: "Activity not found." });
  db.prepare("DELETE FROM activities WHERE id=?").run(a.id);
  res.json({ ok: true });
});

module.exports = router;
