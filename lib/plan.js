// Shared Phase 5 helpers: priority heuristics, effort parsing, timeline building.
// Priority vocabulary is fixed V1-wide: High / Medium / Can Wait.
// Strict calendar-day check for "YYYY-MM-DD" (local calendar, no UTC shifting).
function isValidDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}
// Split freeform brain-dump text into task candidates.
// Lines first; then commas — but never between two digits ("12,30" stays whole).
// Empty fragments are dropped; purely numeric fragments rejoin the previous
// item (decimal/time fragments). Callers cap the count server-side.
function splitTasks(text) {
  const out = [];
  for (const rawLine of String(text || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Split on commas, except when both neighbours are digits ("12,30" stays whole).
    let cur = "";
    const push = () => {
      const t = cur.trim();
      if (t) out.push(t);
      cur = "";
    };
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ",") {
        const prev = line[i - 1] || "";
        const next = line[i + 1] || "";
        if (/\d/.test(prev) && /\d/.test(next)) {
          cur += ch;
          continue;
        }
        push();
        continue;
      }
      cur += ch;
    }
    push();
  }
  return out;
}
function guessPriority(text, deadline) {
  const t = text.toLowerCase();
  if (deadline) return { priority: "high", reason: "Has a set deadline — treat as time-sensitive." };
  const due = t.match(/due|deadline|tomorrow|urgent|asap|exam|\btoday\b/);
  if (due) return { priority: "high", reason: `Time-sensitive (matched "${due[0]}").` };
  const mid = t.match(/gym|read|call|slides|assignment|meeting|project|demo/);
  if (mid) return { priority: "medium", reason: "Worth doing today; no hard deadline detected." };
  return { priority: "can-wait", reason: "No urgency signals — safe to defer." };
}

function guessEffort(text) {
  const t = text.toLowerCase();
  let m = t.match(/(\d+)\s*min/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\b/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  return 30;
}

function hasDeadlineWords(text) {
  return /due|deadline|tomorrow|urgent|asap|exam|\btoday\b|friday|monday|tuesday|wednesday|thursday/i.test(text);
}

function hasTimeMarker(text) {
  return /\d+\s*min|\d+(?:\.\d+)?\s*h(?:ours?|rs?)?\b/i.test(text);
}

const START_HOUR = { morning: 9, afternoon: 13, evening: 18, night: 21 };

function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = String(Math.floor(mins / 60) % 24).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Order: High → Medium → Can Wait, stable by position then id.
function orderActivities(activities) {
  const rank = { high: 0, medium: 1, "can-wait": 2 };
  return activities.slice().sort((a, b) => rank[a.priority] - rank[b.priority] || a.position - b.position || a.id - b.id);
}

// Build a display timeline from ordered work items; breaks are derived (not stored).
// Items carrying stored start/end times (user retimes) are respected as-is;
// items without them are laid out sequentially from the cursor.
function buildTimeline(ordered, startHHMM) {
  const out = [];
  let cursor = toMin(startHHMM);
  let worked = 0;
  ordered.forEach((a, i) => {
    let start, end;
    if (a.start_time && a.end_time) {
      start = a.start_time;
      end = a.end_time;
      cursor = toMin(end);
    } else {
      start = toHHMM(cursor);
      cursor += a.effort_min;
      end = toHHMM(cursor);
    }
    worked += a.effort_min;
    out.push({ type: "work", activity_id: a.id, text: a.text, priority: a.priority, effort_min: a.effort_min, start_time: start, end_time: end, plan_item_id: a.plan_item_id || null });
    if (worked >= 50 && i < ordered.length - 1) {
      const bStart = toHHMM(cursor);
      cursor += 10;
      worked = 0;
      out.push({ type: "break", text: "Break — stand, stretch, water", start_time: bStart, end_time: toHHMM(cursor) });
    }
  });
  return out;
}

// The session must belong to the signed-in user; returns the session row or null.
function ownSession(db, sessionId, userId) {
  return db.prepare("SELECT * FROM planning_sessions WHERE id = ? AND user_id = ?").get(sessionId, userId) || null;
}

module.exports = { guessPriority, guessEffort, hasDeadlineWords, hasTimeMarker, START_HOUR, toMin, toHHMM, orderActivities, buildTimeline, ownSession, splitTasks, isValidDateKey };
