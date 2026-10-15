// Realistic day scheduler (pure function — no I/O, fully unit-testable).
// Decides order, start/end times, breaks, and what honestly doesn't fit.
//
// Inputs:
//   activities: [{ id, text, priority, effort_min, position, deadline, depends_on }]
//   dayStartMin: minutes since midnight where the day may begin
//   workStartMin/workEndMin: availability window (workEndMin > workStartMin, same day)
//   existing: Map activity_id -> { start, end } in minutes (user-confirmed times win)
//   breakEvery/breakLen: worked-minutes between breaks and break length
//   depText: Map activity_id -> short text (for dependency messages)
// Output: { items, breaks, unscheduled } with HH:MM strings; fixed flags;
//   unscheduled entries carry a human reason. No silent overwrites.
const { toHHMM } = require("./plan");

const RANK = { high: 0, medium: 1, "can-wait": 2 };

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function schedule({ activities, dayStartMin, workStartMin, workEndMin, existing, breakEvery = 50, breakLen = 10, depText = new Map() }) {
  if (!(workEndMin > workStartMin)) throw new Error("Bad working window.");
  const items = [];
  const breaks = [];
  const unscheduled = [];
  const placed = new Map(); // activity_id -> { start, end }
  const byId = new Map(activities.map((a) => [a.id, a]));

  // 1. User-confirmed times always win; detect fixed-vs-fixed overlaps.
  const fixed = [];
  for (const a of activities) {
    const ex = existing.get(a.id);
    if (ex && Number.isInteger(ex.start) && Number.isInteger(ex.end) && ex.end > ex.start) {
      fixed.push({ a, start: ex.start, end: ex.end });
    }
  }
  fixed.sort((x, y) => x.start - y.start);
  const fixedKept = [];
  for (const f of fixed) {
    const clash = fixedKept.find((k) => overlaps(f.start, f.end, k.start, k.end));
    if (clash) {
      unscheduled.push({
        activity_id: f.a.id, text: f.a.text,
        reason: `Overlaps "${clash.a.text}" — change one of the times.`,
      });
      continue;
    }
    if (f.start < workStartMin || f.end > workEndMin) {
      unscheduled.push({
        activity_id: f.a.id, text: f.a.text,
        reason: "Its set time falls outside working hours — move it inside the day.",
      });
      continue;
    }
    fixedKept.push(f);
    placed.set(f.a.id, { start: f.start, end: f.end });
    items.push({ activity_id: f.a.id, start: toHHMM(f.start), end: toHHMM(f.end), fixed: true });
  }

  // 2. Order the rest: dependencies first, then deadline, priority, position.
  const rest = activities.filter((a) => !placed.has(a.id));
  const order = [];
  const visiting = new Set();
  const done = new Set(placed.keys());
  function visit(a) {
    if (done.has(a.id)) return;
    if (visiting.has(a.id)) return; // cycle: schedule without the constraint, note below
    visiting.add(a.id);
    const dep = a.depends_on != null ? byId.get(a.depends_on) : null;
    if (dep && !done.has(dep.id)) visit(dep);
    visiting.delete(a.id);
    done.add(a.id);
    order.push(a);
  }
  const byDeadline = (x) => (x.deadline ? x.deadline : "9999");
  rest
    .slice()
    .sort((a, b) => (byDeadline(a) < byDeadline(b) ? -1 : byDeadline(a) > byDeadline(b) ? 1 : 0)
      || RANK[a.priority] - RANK[b.priority] || a.position - b.position || a.id - b.id)
    .forEach(visit);

  // 3. Place sequentially inside the window, honouring fixed blocks.
  const fixedSorted = fixedKept.slice().sort((a, b) => a.start - b.start);
  let cursor = Math.max(dayStartMin, workStartMin);
  let worked = 0;
  const jumpPastFixed = () => {
    for (const f of fixedSorted) {
      if (cursor >= f.start && cursor < f.end) cursor = f.end;
    }
  };
  for (const a of order) {
    // Dependency must be scheduled and finished first.
    const dep = a.depends_on != null ? byId.get(a.depends_on) : null;
    if (dep && !placed.has(dep.id)) {
      unscheduled.push({
        activity_id: a.id, text: a.text,
        reason: `"${depText.get(dep.id) || dep.text || "A prerequisite"}" couldn't be scheduled, so this waits on it.`,
      });
      continue;
    }
    if (dep) cursor = Math.max(cursor, placed.get(dep.id).end);
    jumpPastFixed();
    const dur = Math.max(1, Math.round(a.effort_min || 30));
    let start = cursor;
    let end = start + dur;
    // Don't silently overlap a fixed block: shift past it when possible.
    const clash = fixedSorted.find((f) => overlaps(start, end, f.start, f.end));
    if (clash) {
      start = clash.end;
      end = start + dur;
    }
    if (end > workEndMin || end > 24 * 60) {
      const why = end > 24 * 60
        ? "It would run past midnight — split it or shorten it."
        : "It doesn't fit in the remaining time — shorten it, move hours, or carry it forward.";
      unscheduled.push({ activity_id: a.id, text: a.text, reason: why });
      continue;
    }
    if (a.deadline) {
      // Deadline is advisory here (a calendar date, not a time); surfaced in the reason text instead.
    }
    placed.set(a.id, { start, end });
    items.push({ activity_id: a.id, start: toHHMM(start), end: toHHMM(end), fixed: false });
    cursor = end;
    worked += dur;
    if (worked >= breakEvery) {
      const bStart = cursor;
      const bEnd = bStart + breakLen;
      const clashB = fixedSorted.find((f) => overlaps(bStart, bEnd, f.start, f.end));
      if (bEnd <= workEndMin && !clashB) {
        breaks.push({ start: toHHMM(bStart), end: toHHMM(bEnd) });
        cursor = bEnd;
      }
      worked = 0;
    }
  }

  items.sort((x, y) => x.start.localeCompare(y.start));
  return { items, breaks, unscheduled };
}

module.exports = { schedule };
