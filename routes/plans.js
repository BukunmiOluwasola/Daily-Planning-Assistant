// Phase 5b: reality check, plan generation, plan editing.
// Breaks are derived at display time (not stored); work items are persisted in plan_items.
const express = require("express");
const store = require("../db");
const { toHHMM, buildTimeline } = require("../lib/plan");
const { schedule } = require("../lib/schedule");
const { aiPrioritise } = require("../lib/ai");

const router = express.Router();
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  next();
}
router.use(requireAuth);

async function ownSession(sid, uid) {
  return store.getSession(sid, uid);
}
// Resolve the schedulable window: explicit working hours win; otherwise the
// session start (or productive-period default) plus a 12-hour day capped at midnight.
async function workWindow(session, userId) {
  const u = await store.findUserById(userId);
  const { toMin } = require("../lib/plan");
  let start = "09:00";
  if (session && /^([01]\d|2[0-3]):[0-5]\d$/.test(session.start_time || "")) {
    start = session.start_time;
  } else {
    const { START_HOUR } = require("../lib/plan");
    const h = START_HOUR[(u && u.productive_period) || "night"];
    start = toHHMM(h * 60);
  }
  if (u && u.work_start && u.work_end) {
    if (toMin(u.work_end) > toMin(u.work_start)) return { start: u.work_start, end: u.work_end };
  }
  const endMin = Math.min(23 * 60 + 59, toMin(start) + 12 * 60);
  return { start, end: toHHMM(endMin) };
}
// Day-start for planning: the session's own start_time when set (from the
// date setup screen), otherwise the user's productive-period default.
async function sessionStart(session, userId) {
  if (session && /^([01]\d|2[0-3]):[0-5]\d$/.test(session.start_time || "")) {
    return session.start_time;
  }
  const { START_HOUR } = require("../lib/plan");
  const u = await store.findUserById(userId);
  const h = START_HOUR[(u && u.productive_period) || "night"];
  return toHHMM(h * 60);
}

function realityFor(activities) {
  const total = activities.reduce((n, a) => n + a.effort_min, 0);
  const overloaded = activities.length > 5 || total > 480;
  return {
    overloaded,
    total_min: total,
    focus_ids: activities.filter((a) => a.priority === "high").map((a) => a.id),
    message: overloaded
      ? `${activities.length} activities (~${Math.round(total / 6) / 10}h) is likely too much for one day. Focus on the High items first; the rest can wait or carry forward.`
      : "Workload looks reasonable for one day.",
  };
}

async function loadTimeline(planId, fallbackStart) {
  const items = await store.listPlanItems(planId);
  const ordered = items.slice().sort((a, b) => a.position - b.position);
  return buildTimeline(
    ordered.map((i) => ({ ...i, plan_item_id: i.plan_item_id })),
    ordered.length ? ordered[0].start_time : fallbackStart
  );
}

// Generate (or regenerate) the suggested plan for a session and persist it.
// Previously user-set times are treated as fixed and survive regeneration:
// the scheduler never silently overwrites confirmed choices.
router.post("/sessions/:id/plan", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const acts = await store.listActivities(s.id);
    if (!acts.length) return res.status(400).json({ error: "No activities to plan." });
    const win = await workWindow(s, req.session.userId);
    const { toMin } = require("../lib/plan");

    let plan = await store.getPlanBySession(s.id);
    let planId;
    let existing = new Map();
    if (!plan) {
      planId = await store.createPlan(s.id, new Date().toISOString());
    } else {
      planId = plan.id;
      for (const it of await store.listPlanItems(planId)) {
        existing.set(it.activity_id, { start: toMin(it.start_time), end: toMin(it.end_time) });
      }
      await store.clearPlanItems(planId);
    }
    const result = schedule({
      activities: acts,
      dayStartMin: toMin(win.start),
      workStartMin: toMin(win.start),
      workEndMin: toMin(win.end),
      existing,
      depText: new Map(acts.map((a) => [a.id, a.text])),
    });
    let pos = 0;
    for (const t of result.items) {
      await store.addPlanItem(planId, t.activity_id, t.start, t.end, pos++);
    }
    const items = await store.listPlanItems(planId);
    // Reload through the same path as GET so both responses are identical.
    const timeline = await loadTimeline(planId, win.start);
    res.status(201).json({
      reality: realityFor(acts),
      timeline,
      items: items.map(({ plan_item_id, ...a }) => ({ plan_item_id, ...a })),
      unscheduled: result.unscheduled,
      window: win,
    });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// Reload the persisted plan (edits survive reload); breaks recomputed deterministically.
router.get("/sessions/:id/plan", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const plan = await store.getPlanBySession(s.id);
    if (!plan) return res.status(404).json({ error: "No plan yet." });
    const acts = await store.listActivities(s.id);
    const scheduled = new Set((await store.listPlanItems(plan.id)).map((i) => i.id));
    const unscheduled = acts
      .filter((a) => !scheduled.has(a.id))
      .map((a) => ({ activity_id: a.id, text: a.text, reason: "Not in the current plan yet — press Generate plan." }));
    res.json({
      reality: realityFor(acts),
      timeline: await loadTimeline(plan.id, await sessionStart(s, req.session.userId)),
      unscheduled,
    });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

router.patch("/plan-items/:id", async (req, res) => {
  try {
    const row = await store.getPlanItemOwned(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: "Plan item not found." });
    const { start_time, end_time, position } = req.body || {};
    if (start_time !== undefined && !TIME_RE.test(start_time)) return res.status(400).json({ error: "Bad start_time." });
    if (end_time !== undefined && !TIME_RE.test(end_time)) return res.status(400).json({ error: "Bad end_time." });
    if (position !== undefined && !Number.isInteger(position)) return res.status(400).json({ error: "Bad position." });
    // Same-day ranges only: end must be after start (no silent overnight blocks).
    const cur = await store.getPlanItemById(row.id);
    const ns = start_time !== undefined ? start_time : cur.start_time;
    const ne = end_time !== undefined ? end_time : cur.end_time;
    const toMin = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    if (toMin(ne) <= toMin(ns)) {
      return res.status(400).json({ error: "End time must be after start time on the same day." });
    }
    // Prevent accidental overlaps with the other blocks in this plan.
    const siblings = await store.listPlanItems(cur.plan_id);
    const clash = siblings.find((it) =>
      it.plan_item_id !== row.id && toMin(ns) < toMin(it.end_time) && toMin(it.start_time) < toMin(ne)
    );
    if (clash) {
      const who = clash.text || "another task";
      return res.status(400).json({ error: `That overlaps "${who}". Pick a time that doesn't clash.` });
    }
    await store.updatePlanItem(row.id, {
      start_time: start_time ?? null,
      end_time: end_time ?? null,
      position: position ?? null,
    });
    res.json(await store.getPlanItemById(row.id));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// AI prioritisation via the connected external service (Gemini), with local fallback.
router.post("/sessions/:id/ai-prioritise", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const acts = await store.listActivities(s.id);
    if (!acts.length) return res.status(400).json({ error: "No activities to prioritise." });
    res.json(await aiPrioritise(acts.map((a) => ({
      id: a.id, text: a.text, effort_min: a.effort_min, deadline: a.deadline,
      status: a.status, priority: a.priority,
    }))));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
