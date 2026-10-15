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
  const g = guessPriority(a.text, a.deadline);
  return { ...a, reason: g.priority === a.priority ? g.reason : "Adjusted by you." };
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
// Only questions that materially improve the plan: deadline, importance,
// duration. Skips finished tasks and user-confirmed priorities.
router.get("/sessions/:id/questions", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const acts = await store.listActivities(s.id);
    const qs = [];
    for (const a of acts) {
      if (qs.length >= 6) break;
      if (a.status === "Completed" || a.status === "Carried Forward") continue;
      if (!a.deadline && !hasDeadlineWords(a.text) && a.priority !== "high") {
        qs.push({ activity_id: a.id, text: a.text, key: "deadline", question: `Does "${a.text}" have a real deadline? (optional — skip if none)`, options: ["today", "tomorrow", "this-week", "none"] });
      }
      if (qs.length >= 6) break;
      if (a.priority === "medium" && a.priority_source !== "user") {
        qs.push({ activity_id: a.id, text: a.text, key: "importance", question: `If "${a.text}" slipped, would it cause real problems?`, options: ["yes-serious", "no-minor"] });
      }
      if (qs.length >= 6) break;
      if (!hasTimeMarker(a.text) && a.effort_min === 30) {
        qs.push({ activity_id: a.id, text: a.text, key: "effort", question: `How long will "${a.text}" take? (minutes — presets are shortcuts)`, options: ["15", "30", "60", "120"] });
      }
    }
    res.json(qs.slice(0, 6));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Answer a clarification question; every answer changes state so the question clears.
// Deadline answers resolve to calendar dates against the session's own date when known.
router.post("/sessions/:id/answers", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const { activity_id, key, value } = req.body || {};
    const a = await store.getActivityInSession(activity_id, s.id);
    if (!a) return res.status(404).json({ error: "Activity not found." });
    const { isValidDateKey } = require("../lib/plan");
    const base = (s.day_date && isValidDateKey(s.day_date)) ? s.day_date : TimeToday();
    if (key === "deadline") {
      if (isValidDateKey(value)) {
        await store.updateActivity(a.id, { deadline: value, priority: "high", priority_source: "user" });
      } else if (value === "today") {
        await store.updateActivity(a.id, { deadline: base, priority: "high", priority_source: "user" });
      } else if (value === "tomorrow") {
        await store.updateActivity(a.id, { deadline: shiftDate(base, 1), priority: "high", priority_source: "user" });
      } else if (value === "this-week") {
        await store.updateActivity(a.id, { deadline: shiftDate(base, 3), priority: "medium", priority_source: "user" });
      } else if (value === "none") {
        await store.updateActivity(a.id, { deadline: null });
      } else return res.status(400).json({ error: "Bad deadline answer." });
    } else if (key === "effort") {
      const mins = parseInt(value, 10);
      if (!Number.isInteger(mins) || mins < 5 || mins > 480) return res.status(400).json({ error: "Enter 5–480 minutes." });
      await store.updateActivity(a.id, { effort_min: mins, priority_source: a.priority_source || "user" });
    } else if (key === "importance") {
      if (value === "yes-serious") await store.updateActivity(a.id, { priority: "high", priority_source: "user" });
      else if (value === "no-minor") await store.updateActivity(a.id, { priority_source: "user" });
      else return res.status(400).json({ error: "Bad importance answer." });
    } else {
      return res.status(400).json({ error: "Unknown question." });
    }
    res.json(withReason(await store.getActivityById(a.id)));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});
function TimeToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftDate(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

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
    const { text, priority, effort_min, status, position, deadline, notes, depends_on, priority_source } = req.body || {};
    if (priority !== undefined && !PRIORITIES.includes(String(priority).toLowerCase())) {
      return res.status(400).json({ error: "priority must be High, Medium, or Can Wait." });
    }
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: "Bad status." });
    if (effort_min !== undefined && (!Number.isInteger(effort_min) || effort_min <= 0)) {
      return res.status(400).json({ error: "effort_min must be a positive integer." });
    }
    if (deadline !== undefined && deadline !== null) {
      const { isValidDateKey } = require("../lib/plan");
      if (!isValidDateKey(deadline)) return res.status(400).json({ error: "deadline must be a YYYY-MM-DD date or null." });
    }
    if (notes !== undefined && notes !== null && String(notes).length > 1000) {
      return res.status(400).json({ error: "notes must be under 1000 characters." });
    }
    let dep = depends_on;
    if (dep !== undefined && dep !== null) {
      dep = Number(dep);
      if (!Number.isInteger(dep) || dep === a.id) return res.status(400).json({ error: "Bad dependency." });
      const target = await store.getActivityInSession(dep, a.session_id);
      if (!target) return res.status(400).json({ error: "Dependency must be another task in this session." });
      if (target.depends_on === a.id) return res.status(400).json({ error: "Tasks cannot depend on each other." });
    }
    if (priority_source !== undefined && !["user", "ai", "rule"].includes(priority_source)) {
      return res.status(400).json({ error: "Bad priority source." });
    }
    await store.updateActivity(a.id, {
      text: text ?? null,
      priority: priority !== undefined ? String(priority).toLowerCase() : null,
      effort_min: effort_min ?? null,
      status: status ?? null,
      position: position ?? null,
      deadline: deadline !== undefined ? deadline : undefined,
      notes: notes !== undefined ? notes : undefined,
      depends_on: depends_on !== undefined ? dep ?? null : undefined,
      // A manual priority edit marks the choice as the user's own, unless the
      // caller states otherwise (AI applies pass source 'ai').
      priority_source: priority !== undefined
        ? (priority_source || "user")
        : (priority_source ?? null),
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

// Preview parsing WITHOUT saving: split, prioritise and estimate, max 50.
// The UI lets the user review, edit and remove items before submitting.
const { splitTasks } = require("../lib/plan");
const PREVIEW_MAX = 50;
router.post("/sessions/:id/parse-preview", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const items = splitTasks((req.body && req.body.text) || "");
    if (!items.length) return res.status(400).json({ error: "Nothing to parse." });
    if (items.length > PREVIEW_MAX) {
      return res.status(400).json({ error: `Too many tasks at once (max ${PREVIEW_MAX}). Split the dump and try again.` });
    }
    res.json(items.map((text) => {
      const g = guessPriority(text);
      return { text, priority: g.priority, reason: g.reason, effort_min: guessEffort(text) };
    }));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Save a reviewed list of tasks (from the preview step). Same validation as parsing.
router.post("/sessions/:id/activities/bulk", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Provide a non-empty items array." });
    }
    if (items.length > PREVIEW_MAX) {
      return res.status(400).json({ error: `Too many tasks at once (max ${PREVIEW_MAX}).` });
    }
    const clean = [];
    for (const it of items) {
      const text = String((it && it.text) || "").trim();
      const priority = String((it && it.priority) || "medium").toLowerCase();
      const effort = Number((it && it.effort_min) || 30);
      if (!text || text.length > 500) return res.status(400).json({ error: "Each task needs 1–500 characters of text." });
      if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: "priority must be High, Medium, or Can Wait." });
      if (!Number.isInteger(effort) || effort <= 0 || effort > 480) {
        return res.status(400).json({ error: "effort_min must be 1–480 minutes." });
      }
      clean.push({ text, priority, effort_min: effort });
    }
    res.status(201).json(await store.bulkInsertActivities(s.id, clean));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
