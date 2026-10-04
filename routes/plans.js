// Phase 5b: reality check, plan generation, plan editing.
// Breaks are derived at display time (not stored); work items are persisted in plan_items.
const express = require("express");
const db = require("../db/db");
const { orderActivities, buildTimeline, ownSession, START_HOUR, toHHMM } = require("../lib/plan");
const { aiPrioritise } = require("../lib/ai");

const router = express.Router();
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  next();
}
router.use(requireAuth);

function periodStart(userId) {
  const u = db.prepare("SELECT productive_period FROM users WHERE id=?").get(userId);
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

function loadTimeline(planId, fallbackStart) {
  const items = db.prepare(
    `SELECT pi.id AS plan_item_id, pi.start_time, pi.end_time, pi.position, a.* FROM plan_items pi
     JOIN activities a ON a.id=pi.activity_id WHERE pi.plan_id=? ORDER BY pi.position`
  ).all(planId);
  const ordered = items.slice().sort((a, b) => a.position - b.position);
  return buildTimeline(
    ordered.map((i) => ({ ...i, plan_item_id: i.plan_item_id })),
    ordered.length ? ordered[0].start_time : fallbackStart
  );
}

// Generate (or regenerate) the suggested plan for a session and persist it.
router.post("/sessions/:id/plan", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const acts = db.prepare("SELECT * FROM activities WHERE session_id=?").all(s.id);
  if (!acts.length) return res.status(400).json({ error: "No activities to plan." });
  const ordered = orderActivities(acts);
  const start = periodStart(req.session.userId);

  const planId = db.transaction(() => {
    let plan = db.prepare("SELECT * FROM plans WHERE session_id=?").get(s.id);
    if (!plan) {
      const info = db.prepare("INSERT INTO plans (session_id, created_at) VALUES (?,?)").run(s.id, new Date().toISOString());
      plan = { id: info.lastInsertRowid };
    } else {
      db.prepare("DELETE FROM plan_items WHERE plan_id=?").run(plan.id);
    }
    // Persist work items with computed times; breaks stay derived.
    const preview = buildTimeline(ordered, start);
    const ins = db.prepare("INSERT INTO plan_items (plan_id, activity_id, start_time, end_time, position) VALUES (?,?,?,?,?)");
    let pos = 0;
    for (const t of preview) {
      if (t.type !== "work") continue;
      ins.run(plan.id, t.activity_id, t.start_time, t.end_time, pos++);
    }
    return plan.id;
  })();
  const items = db.prepare(
    `SELECT pi.id AS plan_item_id, a.* FROM plan_items pi JOIN activities a ON a.id=pi.activity_id WHERE pi.plan_id=? ORDER BY pi.position`
  ).all(planId);
  res.status(201).json({ reality: realityFor(acts), timeline: loadTimeline(planId, start), items });
});

// Reload the persisted plan (edits survive reload); breaks recomputed deterministically.
router.get("/sessions/:id/plan", (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const plan = db.prepare("SELECT * FROM plans WHERE session_id=?").get(s.id);
  if (!plan) return res.status(404).json({ error: "No plan yet." });
  const acts = db.prepare("SELECT * FROM activities WHERE session_id=?").all(s.id);
  res.json({ reality: realityFor(acts), timeline: loadTimeline(plan.id, periodStart(req.session.userId)) });
});

router.patch("/plan-items/:id", (req, res) => {  const row = db.prepare(
    `SELECT pi.* FROM plan_items pi
     JOIN plans p ON p.id=pi.plan_id
     JOIN planning_sessions s ON s.id=p.session_id
     WHERE pi.id=? AND s.user_id=?`
  ).get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: "Plan item not found." });
  const { start_time, end_time, position } = req.body || {};
  if (start_time !== undefined && !TIME_RE.test(start_time)) return res.status(400).json({ error: "Bad start_time." });
  if (end_time !== undefined && !TIME_RE.test(end_time)) return res.status(400).json({ error: "Bad end_time." });
  if (position !== undefined && !Number.isInteger(position)) return res.status(400).json({ error: "Bad position." });
  db.prepare(
    "UPDATE plan_items SET start_time=COALESCE(?,start_time), end_time=COALESCE(?,end_time), position=COALESCE(?,position) WHERE id=?"
  ).run(start_time ?? null, end_time ?? null, position ?? null, row.id);
  res.json(db.prepare("SELECT * FROM plan_items WHERE id=?").get(row.id));
});

// AI prioritisation via the connected external service (Gemini), with local fallback.
router.post("/sessions/:id/ai-prioritise", async (req, res) => {
  const s = ownSession(db, req.params.id, req.session.userId);
  if (!s) return res.status(404).json({ error: "Session not found." });
  const acts = db.prepare("SELECT id, text FROM activities WHERE session_id=?").all(s.id);
  if (!acts.length) return res.status(400).json({ error: "No activities to prioritise." });
  res.json(await aiPrioritise(acts));
});

module.exports = router;
