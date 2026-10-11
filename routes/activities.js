// Phase 5a: brain-dump parse, clarification Q&A, activity editing.
// Priority vocabulary: High / Medium / Can Wait (stored lowercase).
const express = require("express");
const store = require("../db");
const { guessPriority, guessEffort, hasDeadlineWords, hasTimeMarker } = require("../lib/plan");

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
async function ownSession(sid, uid) {
  return store.getSession(sid, uid);
}

// Parse a freeform brain dump into activities (one per non-empty line).
router.post("/sessions/:id/parse", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const text = (req.body && req.body.text) || "";
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: "Nothing to parse." });
    const base = await store.maxPosition(s.id);
    const out = [];
    let i = 0;
    for (const line of lines) {
      const g = guessPriority(line);
      const id = await store.insertActivity(s.id, line, g.priority, guessEffort(line), base + 1 + i);
      out.push({ id, text: line, priority: g.priority, reason: g.reason });
      i++;
    }
    res.status(201).json(out);
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Clarification questions generated from what each activity is missing (max 6).
router.get("/sessions/:id/questions", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const acts = await store.listActivities(s.id);
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
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Answer a clarification question; every answer changes state so the question clears.
router.post("/sessions/:id/answers", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const { activity_id, key, value } = req.body || {};
    const a = await store.getActivityInSession(activity_id, s.id);
    if (!a) return res.status(404).json({ error: "Activity not found." });
    if (key === "deadline") {
      if (["today", "tomorrow"].includes(value)) await store.updateActivity(a.id, { priority: "high" });
      else if (value === "this-week") await store.updateActivity(a.id, { priority: "medium" });
      else if (value === "none") await store.updateActivity(a.id, { priority: "can-wait" });
      else return res.status(400).json({ error: "Bad deadline answer." });
    } else if (key === "effort") {
      const mins = parseInt(value, 10);
      if (![15, 30, 60, 120].includes(mins)) return res.status(400).json({ error: "Bad effort answer." });
      await store.updateActivity(a.id, { effort_min: mins });
    } else if (key === "mustdo") {
      if (value === "yes") await store.updateActivity(a.id, { priority: "high" });
      else if (value === "no") await store.updateActivity(a.id, { priority: "can-wait" });
      else return res.status(400).json({ error: "Bad must-do answer." });
    } else {
      return res.status(400).json({ error: "Unknown question." });
    }
    res.json(withReason(await store.getActivityById(a.id)));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.get("/sessions/:id/activities", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    res.json((await store.listActivities(s.id)).map(withReason));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.patch("/activities/:id", async (req, res) => {
  try {
    const a = await store.getActivityOwnedBy(req.params.id, req.session.userId);
    if (!a) return res.status(404).json({ error: "Activity not found." });
    const { text, priority, effort_min, status, position } = req.body || {};
    if (priority !== undefined && !PRIORITIES.includes(String(priority).toLowerCase())) {
      return res.status(400).json({ error: "priority must be High, Medium, or Can Wait." });
    }
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: "Bad status." });
    if (effort_min !== undefined && (!Number.isInteger(effort_min) || effort_min <= 0)) {
      return res.status(400).json({ error: "effort_min must be a positive integer." });
    }
    await store.updateActivity(a.id, {
      text: text ?? null,
      priority: priority !== undefined ? String(priority).toLowerCase() : null,
      effort_min: effort_min ?? null,
      status: status ?? null,
      position: position ?? null,
    });
    res.json(withReason(await store.getActivityById(a.id)));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.delete("/activities/:id", async (req, res) => {
  try {
    const a = await store.getActivityOwnedBy(req.params.id, req.session.userId);
    if (!a) return res.status(404).json({ error: "Activity not found." });
    await store.deleteActivity(a.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
