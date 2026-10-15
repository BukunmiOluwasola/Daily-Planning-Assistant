// Planning sessions, productive-period preference, history. All scoped to the signed-in user.
const express = require("express");
const store = require("../db");

const router = express.Router();
const now = () => new Date().toISOString();
const PERIODS = ["morning", "afternoon", "evening", "night"];

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  next();
}
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    res.json(await store.listSessions(req.session.userId));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.post("/", async (req, res) => {
  try {
    const day = req.body && req.body.day;
    if (!["today", "tomorrow"].includes(day)) {
      return res.status(400).json({ error: "day must be 'today' or 'tomorrow'." });
    }
    const id = await store.createSession(req.session.userId, day, now());
    res.status(201).json({ id, day });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const row = await store.getSession(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: "Session not found." });
    row.activities = await store.listActivities(row.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.put("/preference", async (req, res) => {
  try {
    const period = req.body && req.body.productive_period;
    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: "productive_period must be morning/afternoon/evening/night." });
    }
    await store.setPreference(req.session.userId, period);
    res.json({ productive_period: period });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Working-hours + period settings in one place (work times optional, nullable).
router.put("/settings", async (req, res) => {
  try {
    const { productive_period, work_start, work_end } = req.body || {};
    await store.updateUserSettings(req.session.userId, { productive_period, work_start, work_end });
    const u = await store.findUserById(req.session.userId);
    res.json({ productive_period: u.productive_period, work_start: u.work_start, work_end: u.work_end });
  } catch (err) {
    res.status(400).json({ error: err.message === "Bad period." || err.message === "Bad time." ? err.message : "Request failed." });
  }
});

// History: past sessions with per-status counts.
router.get("/history/all", async (req, res) => {
  try {
    const rows = await store.listSessions(req.session.userId);
    const counts = await store.historyCounts(req.session.userId);
    const bySession = {};
    for (const c of counts) {
      (bySession[c.session_id] = bySession[c.session_id] || []).push({ status: c.status, n: c.n });
    }
    res.json(rows.map((s) => ({ ...s, activity_counts: bySession[s.id] || [] })));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Find-or-create the single session for this user and calendar date.
// Concurrent or repeated calls converge on one row ({ created } tells which).
router.post("/by-date", async (req, res) => {
  try {
    const { date, day, start_time } = req.body || {};
    const { isValidDateKey } = require("../lib/plan");
    if (!isValidDateKey(date)) {
      return res.status(400).json({ error: "date must be a valid YYYY-MM-DD calendar day." });
    }
    if (!["today", "tomorrow"].includes(day)) {
      return res.status(400).json({ error: "day must be 'today' or 'tomorrow'." });
    }
    let start = null;
    if (start_time !== undefined && start_time !== null) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time)) {
        return res.status(400).json({ error: "start_time must be HH:MM." });
      }
      start = start_time;
    }
    const { row, created } = await store.findOrCreateSessionByDate(
      req.session.userId, day, date, start, now()
    );
    res.status(created ? 201 : 200).json({ ...row, created });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.get("/by-date/:date", async (req, res) => {
  try {
    const { isValidDateKey } = require("../lib/plan");
    if (!isValidDateKey(req.params.date)) {
      return res.status(400).json({ error: "date must be a valid YYYY-MM-DD calendar day." });
    }
    const row = await store.findSessionByDate(req.session.userId, req.params.date);
    if (!row) return res.status(404).json({ error: "No session for this date yet." });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Change the day-start override for a session (HH:MM, or null for peak-hours default).
router.patch("/:id/start", async (req, res) => {
  try {
    const { start_time } = req.body || {};
    if (start_time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time || "")) {
      return res.status(400).json({ error: "start_time must be HH:MM or null." });
    }
    const row = await store.setSessionStart(req.params.id, req.session.userId, start_time);
    if (!row) return res.status(404).json({ error: "Session not found." });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
