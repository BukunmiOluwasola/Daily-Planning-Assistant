// Phase 6: focus sessions, break reminders, review summary, carry-forward.
// Statuses follow the PRD: Not Started / In Progress / Completed /
// Partially Completed / Not Completed, plus Carried Forward once moved.
const express = require("express");
const store = require("../db");

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
router.post("/sessions/:id/focus", async (req, res) => {
  try {
    const s = await store.getSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const { activity_id, duration_min } = req.body || {};
    const a = await store.getActivityInSession(activity_id, s.id);
    if (!a) return res.status(404).json({ error: "Activity not found." });
    const mins = duration_min === undefined ? 25 : duration_min;
    if (!Number.isInteger(mins) || mins <= 0) return res.status(400).json({ error: "duration_min must be a positive integer." });
    await store.updateActivity(a.id, { status: "In Progress" });
    const id = await store.createFocus(a.id, now(), mins);
    res.status(201).json({ id, activity_id: a.id, duration_min: mins });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// End a focus session; the response carries the break reminder.
router.patch("/focus/:id", async (req, res) => {
  try {
    const f = await store.getFocusOwned(req.params.id, req.session.userId);
    if (!f) return res.status(404).json({ error: "Focus session not found." });
    if (f.ended_at) return res.status(409).json({ error: "Already ended." });
    const ended = now();
    const elapsed = Math.max(1, Math.round((new Date(ended) - new Date(f.started_at)) / 60000));
    await store.endFocus(f.id, ended, elapsed);
    res.json({ ...(await store.getFocusById(f.id)), break: BREAK_MSG });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Latest still-running focus session in this session's activities (for resume after reload).
router.get("/sessions/:id/focus/open", async (req, res) => {
  try {
    const s = await store.getSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    res.json(await store.latestOpenFocus(s.id));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Daily review summary for a session.
router.post("/sessions/:id/review", async (req, res) => {
  try {
    const s = await store.getSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const rows = await store.reviewCounts(s.id);
    const by_status = {};
    let total = 0;
    for (const r of rows) {
      by_status[r.status] = r.n;
      total += r.n;
    }
    const completed = by_status["Completed"] || 0;
    res.json({ session_id: s.id, total, by_status, completed, remaining: total - completed });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Carry unfinished items into a new session (default: a fresh 'tomorrow' session).
router.post("/sessions/:id/carry-forward", async (req, res) => {
  try {
    const s = await store.getSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const day = (req.body && req.body.day) || "tomorrow";
    if (!["today", "tomorrow"].includes(day)) return res.status(400).json({ error: "day must be 'today' or 'tomorrow'." });
    const left = await store.unfinishedInSession(s.id);
    const nsid = await store.createSession(req.session.userId, day, now());
    let i = 0;
    for (const a of left) {
      await store.insertActivity(nsid, a.text, a.priority, a.effort_min, i++);
    }
    await store.markCarried(s.id);
    res.status(201).json({ new_session_id: nsid, carried: left.length });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
