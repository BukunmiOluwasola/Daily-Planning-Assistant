// Phase 5b: reality check, plan generation, plan editing.
// Breaks are derived at display time (not stored); work items are persisted in plan_items.
const express = require("express");
const store = require("../db");
const { orderActivities, buildTimeline, START_HOUR, toHHMM } = require("../lib/plan");
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
async function periodStart(userId) {
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
router.post("/sessions/:id/plan", async (req, res) => {
  try {
    const s = await ownSession(req.params.id, req.session.userId);
    if (!s) return res.status(404).json({ error: "Session not found." });
    const acts = await store.listActivities(s.id);
    if (!acts.length) return res.status(400).json({ error: "No activities to plan." });
    const ordered = orderActivities(acts);
    const start = await periodStart(req.session.userId);

    let plan = await store.getPlanBySession(s.id);
    let planId;
    if (!plan) {
      planId = await store.createPlan(s.id, new Date().toISOString());
    } else {
      planId = plan.id;
      await store.clearPlanItems(planId);
    }
    // Persist work items with computed times; breaks stay derived.
    const preview = buildTimeline(ordered, start);
    let pos = 0;
    for (const t of preview) {
      if (t.type !== "work") continue;
      await store.addPlanItem(planId, t.activity_id, t.start_time, t.end_time, pos++);
    }
    const items = await store.listPlanItems(planId);
    res.status(201).json({
      reality: realityFor(acts),
      timeline: await loadTimeline(planId, start),
      items: items.map(({ plan_item_id, ...a }) => ({ plan_item_id, ...a })),
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
    res.json({ reality: realityFor(acts), timeline: await loadTimeline(plan.id, await periodStart(req.session.userId)) });
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
    res.json(await aiPrioritise(acts.map((a) => ({ id: a.id, text: a.text }))));
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
