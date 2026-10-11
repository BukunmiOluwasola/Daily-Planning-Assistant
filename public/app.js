// Daily Planning Assistant frontend.
// Views: landing → auth → app. All API errors surface in the toast; nothing fails silently.
async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...(opts || {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || ("Request failed: " + res.status));
    err.status = res.status;
    throw err;
  }
  return body;
}

let toastTimer = null;
function toast(msg, kind) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (kind ? " " + kind : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---- View router ----
const VIEWS = ["landing", "auth", "app"];
function showView(name) {
  for (const v of VIEWS) document.getElementById("view-" + v).hidden = v !== name;
  window.scrollTo(0, 0);
}

// ---- Progress steps ----
const STEP_ORDER = ["plan", "clarify", "focus", "review"];
function setStep(current) {
  const items = document.querySelectorAll("#steps li");
  const idx = STEP_ORDER.indexOf(current);
  items.forEach((li) => {
    const i = STEP_ORDER.indexOf(li.dataset.step);
    li.classList.toggle("active", i === idx);
    li.classList.toggle("done", i < idx);
  });
}

// ---- Auth ----
let authMode = "signin"; // or "signup"
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  document.getElementById("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  document.getElementById("authSub").textContent = signup
    ? "Just an email and password — nothing else needed."
    : "Sign in with your email and password.";
  document.getElementById("authGoBtn").textContent = signup ? "Create account" : "Sign in";
  document.getElementById("authToggle").textContent = signup ? "Sign in instead" : "Create an account";
  document.getElementById("password").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  hideAuthError();
}
function showAuthError(msg) {
  const box = document.getElementById("authError");
  box.textContent = msg;
  box.hidden = false;
}
function hideAuthError() {
  document.getElementById("authError").hidden = true;
}

document.getElementById("ctaBtn").onclick = () => { setAuthMode("signup"); showView("auth"); };
document.getElementById("landingSigninBtn").onclick = () => { setAuthMode("signin"); showView("auth"); };
document.getElementById("authToggle").onclick = () => setAuthMode(authMode === "signup" ? "signin" : "signup");
document.getElementById("authBackBtn").onclick = () => showView("landing");

document.getElementById("authForm").onsubmit = async (e) => {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) {
    showAuthError("Please enter both an email and a password.");
    return;
  }
  const btn = document.getElementById("authGoBtn");
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "Please wait…";
  try {
    if (authMode === "signup") {
      await api("/api/users/signup", { method: "POST", body: JSON.stringify({ email, password }) });
      toast("Account created — welcome!", "ok");
    } else {
      await api("/api/users/login", { method: "POST", body: JSON.stringify({ email, password }) });
      toast("Welcome back!", "ok");
    }
    document.getElementById("password").value = "";
    await enterApp();
  } catch (err) {
    if (err.status === 409) {
      // Email belongs to an account: guide to sign-in, never auto-login.
      setAuthMode("signin");
      showAuthError("An account with this email already exists — please sign in.");
    } else if (err.status === 401) {
      showAuthError("Incorrect email or password. Please try again.");
    } else {
      showAuthError(err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === "signup" ? "Create account" : "Sign in";
    void label;
  }
};

async function enterApp() {
  showView("app");
  refreshZoneLine();
  setStep("plan");
  await refresh();
}

// ---- Time display: 12h/24h preference (per-browser) + device time zone.
// Stored task times stay canonical 24h "HH:MM"; only display converts.
let timeMode = localStorage.getItem("dpa-time-format") || "24";
if (timeMode !== "12" && timeMode !== "24") timeMode = "24";
const deviceZone = TimeFmt.localZone();

function refreshZoneLine() {
  document.getElementById("zoneLine").textContent =
    `Times shown in ${deviceZone} (${timeMode === "12" ? "12-hour" : "24-hour"}).`;
  document.getElementById("timeMode").value = timeMode;
}
document.getElementById("timeMode").onchange = async (e) => {
  timeMode = e.target.value === "12" ? "12" : "24";
  localStorage.setItem("dpa-time-format", timeMode);
  refreshZoneLine();
  if (workSessionId && !document.getElementById("workCard").hidden) {
    try { await refreshWork(); } catch (err) { toast(err.message, "err"); }
  }
};

// ---- Account + sessions (signed-in area) ----
async function refreshMe() {
  try {
    const me = await api("/api/users/me");
    document.getElementById("meLine").textContent =
      "Signed in as " + me.email + " · peak hours: " + me.productive_period;
    document.getElementById("period").value = me.productive_period;
  } catch {
    document.getElementById("meLine").textContent = "Not signed in.";
  }
}

async function refreshSessions() {
  try {
    const rows = await api("/api/sessions/history/all");
    document.getElementById("sessionList").innerHTML = rows
      .map((s) => {
        const counts = (s.activity_counts || [])
          .map((c) => c.status + ": " + c.n)
          .join(", ");
        const when = TimeFmt.fmtInstant(s.created_at, deviceZone, timeMode);
        return `<li><strong>#${s.id} · ${s.day}</strong> <span class="sub">${when}</span><br><span class="sub">${counts || "no activities yet"}</span> <button class="btn btn-ghost btn-small" data-open="${s.id}" type="button">Open</button></li>`;
      })
      .join("") || "<li>Nothing here yet — create your first session above.</li>";
  } catch {
    document.getElementById("sessionList").innerHTML = "<li>Sign in to see sessions.</li>";
  }
}

async function refresh() {
  await refreshMe();
  await refreshSessions();
}

document.getElementById("logoutBtn").onclick = async () => {
  try {
    await api("/api/users/logout", { method: "POST" });
    document.getElementById("workCard").hidden = true;
    workSessionId = null;
    showView("landing");
    toast("Signed out.");
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("createSessionBtn").onclick = async () => {
  try {
    const day = document.getElementById("day").value;
    await api("/api/sessions", { method: "POST", body: JSON.stringify({ day }) });
    toast("Session created.", "ok");
    await refreshSessions();
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("savePeriodBtn").onclick = async () => {
  try {
    const productive_period = document.getElementById("period").value;
    await api("/api/sessions/preference", {
      method: "PUT",
      body: JSON.stringify({ productive_period }),
    });
    toast("Preference saved.", "ok");
    await refreshMe();
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("refreshBtn").onclick = refresh;

// ---- Plan flow for the selected session ----
let workSessionId = null;
const PILL = { high: "High", medium: "Medium", "can-wait": "Can Wait" };

async function openSession(id, day) {
  workSessionId = id;
  document.getElementById("workCard").hidden = false;
  document.getElementById("workTitle").textContent = "Session #" + id + " · " + day;
  setStep("plan");
  try {
    await refreshWork();
  } catch (err) { toast(err.message, "err"); }
}

async function refreshWork() {
  const acts = await api("/api/sessions/" + workSessionId + "/activities");
  document.getElementById("activityList").innerHTML = acts
    .map((a) => `<li><strong>[${PILL[a.priority]}]</strong> ${a.text} <span class="sub">(~${a.effort_min} min — ${a.reason})</span><br>
      <label>Priority:
      <select data-edit-prio="${a.id}">
        <option value="high"${a.priority === "high" ? " selected" : ""}>High</option>
        <option value="medium"${a.priority === "medium" ? " selected" : ""}>Medium</option>
        <option value="can-wait"${a.priority === "can-wait" ? " selected" : ""}>Can Wait</option>
      </select></label>
      <button class="btn btn-ghost btn-small" data-del="${a.id}" type="button">Remove</button></li>`)
    .join("") || "<li>Nothing here yet — paste a brain dump above and press “Get my suggested plan”.</li>";
  const qs = await api("/api/sessions/" + workSessionId + "/questions");
  document.getElementById("questionList").innerHTML = qs
    .map((q, i) => `<li>${q.question}<br>${q.options
      .map((o) => `<button class="btn btn-ghost btn-small" data-q="${i}" data-v="${o}" type="button">${o}</button>`)
      .join(" ")}</li>`)
    .join("") || "<li>No questions — everything is clear.</li>";
  window._qs = qs;
  try {
    const plan = await api("/api/sessions/" + workSessionId + "/plan");
    renderPlan(plan);
  } catch {
    document.getElementById("planList").innerHTML = "<li>No plan yet — press “Generate plan” below.</li>";
    document.getElementById("realityBox").innerHTML = "";
  }
  await refreshReview();
  if (!focusTick && !focusId) await resumeFocus();
}

function renderPlan(plan) {
  const r = plan.reality;
  document.getElementById("realityBox").innerHTML =
    `<p><strong>Reality check:</strong> ${r.message}</p>`;
  document.getElementById("planList").innerHTML = plan.timeline
    .map((t, i) =>
      t.type === "break"
        ? `<li>☕ ${TimeFmt.fmtTime(t.start_time, timeMode)} — ${t.text} (${TimeFmt.fmtTime(t.start_time, timeMode)}–${TimeFmt.fmtTime(t.end_time, timeMode)})</li>`
        : `<li><strong class="time">${TimeFmt.fmtTime(t.start_time, timeMode)}</strong> [${PILL[t.priority]}] ${t.text} (${TimeFmt.fmtTime(t.start_time, timeMode)}–${TimeFmt.fmtTime(t.end_time, timeMode)})<br>
          <button class="btn btn-ghost btn-small" data-tedit="${i}" type="button">Edit time</button>
          <span data-tform="${i}" hidden></span></li>`
    )
    .join("");
  window._timeline = plan.timeline;
}

// Inline start-time editor for one timeline row. Saved back as canonical 24h;
// switching display modes never alters saved times.
function minuteOptions(sel) {
  let out = "";
  for (let m = 0; m < 60; m += 5) {
    const v = String(m).padStart(2, "0");
    out += `<option value="${v}"${v === sel ? " selected" : ""}>${v}</option>`;
  }
  return out;
}
function timeEditorHTML(i, storedHHMM) {
  const p = TimeFmt.parseHHMM(storedHHMM);
  if (timeMode === "12") {
    const c = TimeFmt.hour12(p.h24);
    const mm5 = String(Math.round(p.m / 5) * 5 % 60).padStart(2, "0");
    let hours = "";
    for (let h = 1; h <= 12; h++) hours += `<option${h === c.h12 ? " selected" : ""}>${h}</option>`;
    return `<label>Hour: <select data-th="${i}" aria-label="Hour">${hours}</select></label> `
      + `<label>Min: <select data-tm="${i}" aria-label="Minutes">${minuteOptions(mm5)}</select></label> `
      + `<label>AM/PM: <select data-tap="${i}"><option${c.ampm === "AM" ? " selected" : ""}>AM</option><option${c.ampm === "PM" ? " selected" : ""}>PM</option></select></label> `
      + `<button class="btn btn-primary btn-small" data-tsave="${i}" type="button">Save</button>`;
  }
  let hours = "";
  for (let h = 0; h < 24; h++) {
    const v = String(h).padStart(2, "0");
    hours += `<option value="${v}"${h === p.h24 ? " selected" : ""}>${v}</option>`;
  }
  return `<label>Hour: <select data-th="${i}" aria-label="Hour (24-hour)">${hours}</select></label> `
    + `<label>Min: <select data-tm="${i}" aria-label="Minutes">${minuteOptions(String(p.m).padStart(2, "0"))}</select></label> `
    + `<button class="btn btn-primary btn-small" data-tsave="${i}" type="button">Save</button>`;
}

document.getElementById("parseBtn").onclick = async () => {
  try {
    const text = document.getElementById("dump").value;
    if (!text.trim()) { toast("Write a few things first — one per line.", "err"); return; }
    await api("/api/sessions/" + workSessionId + "/parse", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    document.getElementById("dump").value = "";
    setStep("clarify");
    toast("Activities added.", "ok");
    await refreshWork();
    await refreshSessions();
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("genPlanBtn").onclick = async () => {
  try {
    const plan = await api("/api/sessions/" + workSessionId + "/plan", { method: "POST" });
    setStep("focus");
    renderPlan(plan);
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("askAiBtn").onclick = async () => {
  try {
    const r = await api("/api/sessions/" + workSessionId + "/ai-prioritise", { method: "POST" });
    window._ai = r.ranking;
    document.getElementById("aiBox").innerHTML =
      `<p><strong>AI suggestion</strong> <span class="sub">(via ${r.provider})</span></p><ul class="items">` +
      r.ranking.map((x) => `<li>[${PILL[x.priority]}] activity #${x.id} — ${x.reason}</li>`).join("") +
      `</ul><div class="row"><button class="btn btn-primary" id="applyAiBtn" type="button">Apply AI priorities</button></div>`;
    document.getElementById("applyAiBtn").onclick = async () => {
      try {
        for (const x of window._ai) {
          await api("/api/activities/" + x.id, { method: "PATCH", body: JSON.stringify({ priority: x.priority }) });
        }
        toast("AI priorities applied — adjust anything you disagree with.", "ok");
        await refreshWork();
      } catch (err) { toast(err.message, "err"); }
    };
  } catch (err) { toast(err.message, "err"); }
};

// ---- Focus, review, carry-forward ----
// Sleep-proof countdown: the end moment is a fixed timestamp, so a sleeping
// laptop can't drift the timer. The server persists the start, so reload resumes.
const STATUSES = ["Not Started", "In Progress", "Completed", "Partially Completed", "Not Completed"];
let focusId = null, focusEndsAt = 0, focusTick = null;

function fmt(s) {
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function remainingSecs() {
  return Math.max(0, Math.round((focusEndsAt - Date.now()) / 1000));
}
function runCountdown() {
  clearInterval(focusTick);
  document.getElementById("focusTimer").textContent = fmt(remainingSecs());
  focusTick = setInterval(() => {
    const left = remainingSecs();
    document.getElementById("focusTimer").textContent = fmt(left);
    if (left <= 0) {
      clearInterval(focusTick);
      focusTick = null;
      endFocus();
    }
  }, 1000);
}

async function refreshReview() {
  const acts = await api("/api/sessions/" + workSessionId + "/activities");
  document.getElementById("focusPick").innerHTML = acts
    .map((a) => `<option value="${a.id}">${a.text}</option>`)
    .join("");
  document.getElementById("reviewList").innerHTML = acts
    .map((a) => `<li>${a.text} <span class="sub">[${a.status}]</span><br>
      <label>Status:
      <select data-status="${a.id}">${STATUSES.map((s) => `<option${a.status === s ? " selected" : ""}>${s}</option>`).join("")}</select></label></li>`)
    .join("") || "<li>Nothing to review yet.</li>";
}

// Browser notifications (opt-in): remind even if the tab is in the background.
// In-app break messages always show regardless — notifications are a bonus, not the mechanism.
async function ensureNotifyPermission() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    toast("Heads up: we’ll ask for notification permission so the break reminder can reach you outside this tab.");
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
function notifyBreak(msg) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Focus complete — time for a break", { body: msg });
    }
  } catch { /* in-app message below is the guaranteed path */ }
}

document.getElementById("focusStartBtn").onclick = async () => {
  try {
    if (focusTick) return;
    await ensureNotifyPermission();
    const activity_id = Number(document.getElementById("focusPick").value);
    if (!activity_id) { toast("Add an activity first.", "err"); return; }
    const f = await api("/api/sessions/" + workSessionId + "/focus", {
      method: "POST",
      body: JSON.stringify({ activity_id }),
    });
    focusId = f.id;
    focusEndsAt = Date.now() + f.duration_min * 60000;
    document.getElementById("breakBox").innerHTML = "";
    runCountdown();
  } catch (err) { toast(err.message, "err"); }
};
// Resume a focus session left running across a page reload.
async function resumeFocus() {
  try {
    const open = await api("/api/sessions/" + workSessionId + "/focus/open");
    if (!open) return;
    focusId = open.id;
    focusEndsAt = new Date(open.started_at).getTime() + open.duration_min * 60000;
    if (remainingSecs() <= 0) {
      await endFocus();
      return;
    }
    document.getElementById("focusPick").value = String(open.activity_id);
    toast("Resumed your running focus timer.", "ok");
    runCountdown();
  } catch { /* no open focus — nothing to resume */ }
}
async function endFocus() {
  if (!focusId) return;
  try {
    const done = await api("/api/focus/" + focusId, { method: "PATCH" });
    focusId = null;
    document.getElementById("focusTimer").textContent = fmt(25 * 60);
    document.getElementById("breakBox").innerHTML = `<p><strong>Break:</strong> ${done.break}</p>`;
    notifyBreak(done.break);
  } catch (err) { toast(err.message, "err"); }
  await refreshReview();
  try { await refreshWork(); } catch (err) { toast(err.message, "err"); }
}
document.getElementById("focusEndBtn").onclick = async () => {
  if (focusTick) {
    clearInterval(focusTick);
    focusTick = null;
  }
  await endFocus();
};
document.getElementById("notifyTestBtn").onclick = async () => {
  const ok = await ensureNotifyPermission();
  if (!ok) {
    toast("Notifications are blocked or unavailable — in-app reminders still work.", "err");
    return;
  }
  try {
    new Notification("Daily Planning Assistant", { body: "Test notification works. Break reminders will reach you here too." });
    toast("Test notification sent.", "ok");
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("reviewBtn").onclick = async () => {
  try {
    const s = await api("/api/sessions/" + workSessionId + "/review", { method: "POST" });
    setStep("review");
    document.getElementById("summaryBox").innerHTML =
      `<p><strong>Review:</strong> ${s.completed} of ${s.total} completed (${JSON.stringify(s.by_status)}).</p>`;
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("carryBtn").onclick = async () => {
  try {
    const r = await api("/api/sessions/" + workSessionId + "/carry-forward", {
      method: "POST",
      body: JSON.stringify({}),
    });
    document.getElementById("summaryBox").innerHTML =
      `<p><strong>Carried forward</strong> ${r.carried} item(s) into session #${r.new_session_id}.</p>`;
    toast("Carried forward.", "ok");
    await refreshWork();
    await refreshReview();
    await refreshSessions();
  } catch (err) { toast(err.message, "err"); }
};
document.addEventListener("change", async (e) => {
  try {
    const id = e.target.dataset && e.target.dataset.status;
    if (id) {
      await api("/api/activities/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status: e.target.value }),
      });
    }
    const prio = e.target.dataset && e.target.dataset.editPrio;
    if (prio) {
      await api("/api/activities/" + prio, {
        method: "PATCH",
        body: JSON.stringify({ priority: e.target.value }),
      });
      await refreshWork();
    }
  } catch (err) { toast(err.message, "err"); }
});
document.addEventListener("click", async (e) => {
  try {
    const q = e.target.dataset && e.target.dataset.q;
    if (q !== undefined && window._qs) {
      const item = window._qs[Number(q)];
      await api("/api/sessions/" + workSessionId + "/answers", {
        method: "POST",
        body: JSON.stringify({ activity_id: item.activity_id, key: item.key, value: e.target.dataset.v }),
      });
      await refreshWork();
      return;
    }
    const del = e.target.dataset && e.target.dataset.del;
    if (del) {
      await api("/api/activities/" + del, { method: "DELETE" });
      toast("Removed.", "ok");
      await refreshWork();
      return;
    }
    const te = e.target.dataset && e.target.dataset.tedit;
    if (te !== undefined && window._timeline) {
      const row = window._timeline[Number(te)];
      if (row && row.type === "work") {
        const slot = document.querySelector(`[data-tform="${te}"]`);
        slot.innerHTML = " " + timeEditorHTML(Number(te), row.start_time);
        slot.hidden = false;
      }
      return;
    }
    const ts = e.target.dataset && e.target.dataset.tsave;
    if (ts !== undefined && window._timeline) {
      const row = window._timeline[Number(ts)];
      const root = document.querySelector(`[data-tform="${ts}"]`);
      try {
        const h = root.querySelector("[data-th]").value;
        const m = root.querySelector("[data-tm]").value;
        const ap = root.querySelector("[data-tap]");
        const start = ap ? TimeFmt.from12(h, m, ap.value) : `${String(h).padStart(2, "0")}:${m}`;
        // End shifts by the same delta so the block keeps its length.
        const oldStart = TimeFmt.parseHHMM(row.start_time);
        const oldEnd = TimeFmt.parseHHMM(row.end_time);
        const len = (oldEnd.h24 * 60 + oldEnd.m) - (oldStart.h24 * 60 + oldStart.m);
        const ns = TimeFmt.parseHHMM(start);
        const total = ns.h24 * 60 + ns.m + len;
        const end = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
        await api("/api/plan-items/" + row.plan_item_id, {
          method: "PATCH",
          body: JSON.stringify({ start_time: start, end_time: end }),
        });
        toast("Time updated.", "ok");
        await refreshWork();
      } catch (err) { toast(err.message, "err"); }
      return;
    }
    const sid = e.target.dataset && e.target.dataset.open;
    if (sid) {
      const all = await api("/api/sessions/history/all");
      const s = all.find((x) => String(x.id) === String(sid));
      await openSession(sid, s ? s.day : "");
    }
  } catch (err) { toast(err.message, "err"); }
});

// ---- Boot: signed-in users skip landing ----
(async function boot() {
  try {
    await api("/api/users/me");
    await enterApp();
  } catch {
    showView("landing");
  }
})();
