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

module.exports = router;
