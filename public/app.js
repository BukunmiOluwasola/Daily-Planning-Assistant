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
    if (res.status === 401 && !window._expiredShown) {
      // Session expired mid-use (idle/absolute timeout): send back to sign-in once.
      const inApp = !document.getElementById("view-app").hidden
        || !document.getElementById("view-setup").hidden;
      if (inApp) {
        window._expiredShown = true;
        toast("Session expired. Please sign in again.", "err");
        setAuthMode("signin");
        showView("auth");
        setTimeout(() => { window._expiredShown = false; }, 5000);
      }
    }
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

// ---- Theme: light/dark, persisted; OS default until the user chooses ----
function applyTheme() {
  const saved = localStorage.getItem("dpa-theme");
  const theme = saved === "dark" || saved === "light"
    ? saved
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  const t = document.getElementById("themeToggle");
  if (t) t.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}
applyTheme();

// ---- View router ----
const VIEWS = ["landing", "auth", "setup", "reset", "reset-confirm", "app"];
function showView(name) {
  for (const v of VIEWS) document.getElementById("view-" + v).hidden = v !== name;
  window.scrollTo(0, 0);
}

// ---- Wizard: one main task per screen. Panels only hide/show;
// all data lives on the server, so moving never loses anything.
const WSTEPS = ["dump", "clarify", "plan", "focus", "review"];
const WSTEP_CHIP = { dump: "plan", clarify: "clarify", plan: "plan", focus: "focus", review: "review" };
let wstep = 0;
function showWStep(i) {
  wstep = Math.max(0, Math.min(WSTEPS.length - 1, i));
  document.querySelectorAll("[data-wpanel]").forEach((p) => {
    p.hidden = p.dataset.wpanel !== WSTEPS[wstep];
  });
  document.querySelectorAll("[data-wstep]").forEach((li) => {
    li.classList.toggle("active", li.dataset.wstep === WSTEPS[wstep]);
  });
  setStep(WSTEP_CHIP[WSTEPS[wstep]]);
  document.getElementById("wBackBtn").disabled = wstep === 0;
  document.getElementById("wNextBtn").textContent = wstep === WSTEPS.length - 1 ? "Review ↓" : "Continue →";
  document.getElementById("workCard").scrollIntoView({ block: "start" });
}
document.getElementById("wBackBtn").onclick = () => showWStep(wstep - 1);
document.getElementById("wNextBtn").onclick = () => {
  if (wstep === WSTEPS.length - 1) {
    setStep("review");
    document.getElementById("reviewList").scrollIntoView({ block: "start" });
    return;
  }
  showWStep(wstep + 1);
};

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
document.getElementById("forgotBtn").onclick = () => {
  document.getElementById("resetDone").hidden = true;
  showView("reset");
};
document.getElementById("resetBackBtn").onclick = () => { setAuthMode("signin"); showView("auth"); };
document.getElementById("resetSendBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  const email = document.getElementById("resetEmail").value.trim();
  const errBox = document.getElementById("resetError");
  errBox.hidden = true;
  document.getElementById("resetDone").hidden = true;
  if (!email) {
    errBox.textContent = "Please enter your account email.";
    errBox.hidden = false;
    return;
  }
  try {
    await api("/api/users/reset-request", { method: "POST", body: JSON.stringify({ email }) });
    document.getElementById("resetDone").hidden = false;
  } catch (err) {
    if (err.status === 503) {
      errBox.textContent = "Email delivery is not configured yet — please contact support.";
    } else if (err.status === 429) {
      errBox.textContent = "Too many attempts. Please try again later.";
    } else {
      errBox.textContent = err.message;
    }
    errBox.hidden = false;
  }
});
let pendingResetToken = null;
document.getElementById("resetConfirmBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  const pw = document.getElementById("newPassword").value;
  const errBox = document.getElementById("resetConfirmError");
  errBox.hidden = true;
  if (!pw || pw.length < 6) {
    errBox.textContent = "Password must be at least 6 characters.";
    errBox.hidden = false;
    return;
  }
  try {
    await api("/api/users/reset", { method: "POST", body: JSON.stringify({ token: pendingResetToken, password: pw }) });
    pendingResetToken = null;
    history.replaceState(null, "", location.pathname);
    document.getElementById("newPassword").value = "";
    setAuthMode("signin");
    showView("auth");
    toast("Password updated — please sign in.", "ok");
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

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
  await enterSetup();
}
function sessionLabel(s) {
  try {
    if (s.day_date) return TimeFmt.fmtDateKey(s.day_date);
  } catch { /* fall through to legacy label */ }
  return `#${s.id} · ${s.day}`;
}

// ---- Date setup: one session per calendar date ----
const PERIOD_START = { morning: 9, afternoon: 13, evening: 18, night: 21 };
function fillTimeSelects(h24, min) {
  const hs = document.getElementById("setupHour");
  const ms = document.getElementById("setupMin");
  hs.innerHTML = "";
  for (let h = 1; h <= 12; h++) {
    const o = document.createElement("option");
    o.textContent = h;
    hs.appendChild(o);
  }
  ms.innerHTML = "";
  for (let m = 0; m < 60; m += 5) {
    const o = document.createElement("option");
    o.value = String(m).padStart(2, "0");
    o.textContent = o.value;
    ms.appendChild(o);
  }
  const c = TimeFmt.hour12(h24);
  hs.value = String(c.h12);
  ms.value = String(Math.round(min / 5) * 5 % 60).padStart(2, "0");
  document.getElementById("setupAp").value = c.ampm;
}
function shiftDate(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
async function enterSetup() {
  showView("setup");
  document.getElementById("setupError").hidden = true;
  if (!document.getElementById("setupDate").value) {
    document.getElementById("setupDate").value = TimeFmt.todayKey();
  }
  try {
    const me = await api("/api/users/me");
    const h = PERIOD_START[me.productive_period] ?? 21;
    fillTimeSelects(h, 0);
  } catch {
    fillTimeSelects(21, 0);
  }
}
document.getElementById("setupTodayBtn").onclick = () => {
  document.getElementById("setupDate").value = TimeFmt.todayKey();
};
document.getElementById("setupTomorrowBtn").onclick = () => {
  document.getElementById("setupDate").value = shiftDate(TimeFmt.todayKey(), 1);
};
document.getElementById("setupGoBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  const errBox = document.getElementById("setupError");
  errBox.hidden = true;
  const date = document.getElementById("setupDate").value;
  try {
    const start = TimeFmt.from12(
      document.getElementById("setupHour").value,
      document.getElementById("setupMin").value,
      document.getElementById("setupAp").value
    );
    const day = date === TimeFmt.todayKey() ? "today" : "tomorrow";
    const s = await api("/api/sessions/by-date", {
      method: "POST",
      body: JSON.stringify({ date, day, start_time: start }),
    });
    document.getElementById("currentDateLine").textContent = sessionLabel(s);
    showView("app");
    refreshZoneLine();
    await openSession(s.id, sessionLabel(s));
    if (!s.created) toast("Restored your existing plan for this date.", "ok");
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});
document.getElementById("changeDateBtn").onclick = () => enterSetup();

// ---- Menu, theme toggle, safe refresh ----
document.getElementById("menuBtn").onclick = () => {
  const panel = document.getElementById("menuPanel");
  panel.hidden = !panel.hidden;
  document.getElementById("menuBtn").setAttribute("aria-expanded", String(!panel.hidden));
};
document.getElementById("themeToggle").onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("dpa-theme", next);
  applyTheme();
};
document.getElementById("refreshAppBtn").onclick = async () => {
  try {
    // Preserve unsent brain-dump text across the reload.
    sessionStorage.setItem("dpa-draft", document.getElementById("dump").value || "");
    sessionStorage.setItem("dpa-refreshed", "1");
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (reg) await reg.update().catch(() => {});
    }
    location.reload();
  } catch (err) { toast(err.message, "err"); }
};

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
    if (me.work_start) document.getElementById("setWorkStart").value = me.work_start;
    if (me.work_end) document.getElementById("setWorkEnd").value = me.work_end;
  } catch {
    document.getElementById("meLine").textContent = "Not signed in.";
  }
}
function loadAlarmPrefs() {
  const p = alarmPrefs();
  document.getElementById("alarmStart").checked = !!p.start;
  document.getElementById("alarmEnd").checked = !!p.end;
  document.getElementById("alarmBreak").checked = !!p.breaks;
  document.getElementById("alarmRepeat").checked = !!p.repeat;
  document.getElementById("alarmTone").value = p.tone || "chime";
  document.getElementById("speechToggle").checked = !!p.speech;
}
document.getElementById("saveHoursBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  try {
    const work_start = document.getElementById("setWorkStart").value || null;
    const work_end = document.getElementById("setWorkEnd").value || null;
    const r = await api("/api/users/settings", {
      method: "PUT",
      body: JSON.stringify({ work_start, work_end }),
    });
    toast(`Working hours saved${r.work_start ? ` (${r.work_start}–${r.work_end})` : " (cleared — peak-hours default)"}. Applies to future plans.`, "ok");
  } catch (err) { toast(err.message, "err"); }
});
for (const id of ["alarmStart", "alarmEnd", "alarmBreak", "alarmRepeat", "alarmTone", "speechToggle"]) {
  document.getElementById(id).addEventListener("change", () => {
    saveAlarmPrefs({
      start: document.getElementById("alarmStart").checked,
      end: document.getElementById("alarmEnd").checked,
      breaks: document.getElementById("alarmBreak").checked,
      repeat: document.getElementById("alarmRepeat").checked,
      tone: document.getElementById("alarmTone").value,
      speech: document.getElementById("speechToggle").checked,
    });
    toast("Alert preference saved on this device.", "ok");
  });
}
document.getElementById("tonePreviewBtn").onclick = () => {
  if (!playTone(document.getElementById("alarmTone").value, 1)) {
    toast("Sound unavailable here — in-app messages still work.", "err");
  }
};
document.getElementById("alarmTestBtn").onclick = async () => {
  const ok = await ensureNotifyPermission();
  playTone(document.getElementById("alarmTone").value, 1);
  toast(ok ? "Test alarm played." : "Test alarm played (notifications unavailable, in-app only).", "ok");
};
document.getElementById("speechPreviewBtn").onclick = () => {
  if (!("speechSynthesis" in window)) {
    toast("Spoken announcements are not supported in this browser.", "err");
    return;
  }
  speakAlarm("start", "Sample task");
  toast("Voice preview played.", "ok");
};
// Optional spoken announcements. Concise on purpose (task title only, no
// details), spoken once per alert, silent when unsupported or disabled.
function speakAlarm(kind, label) {
  try {
    if (!alarmPrefs().speech) return false;
    if (!("speechSynthesis" in window)) return false;
    const text = kind === "start"
      ? `Time to start ${label}.`
      : kind === "end"
        ? `Time is up for ${label}. Time to review your progress.`
        : "Time for a short break.";
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
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
        return `<li><strong>${sessionLabel(s)}</strong><br><span class="sub">${counts || "no activities yet"}</span> <button class="btn btn-ghost btn-small" data-open="${s.id}" type="button">Open</button></li>`;
      })
      .join("") || "<li>Nothing here yet — pick a date above to start.</li>";
  } catch {
    document.getElementById("sessionList").innerHTML = "<li>Sign in to see sessions.</li>";
  }
}

async function refresh() {
  loadAlarmPrefs();
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

// ---- Undo / redo for reversible task changes (this session only).
// Each entry knows how to undo and redo itself via the same validated APIs.
// Deleting then undoing re-saves the task content (a restored copy); the
// original row id cannot come back from a hard delete, and the UI says so.
const undoStack = [];
const redoStack = [];
const UNDO_MAX = 30;
function pushHistory(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function updateUndoButtons() {
  document.getElementById("undoBtn").disabled = undoStack.length === 0;
  document.getElementById("redoBtn").disabled = redoStack.length === 0;
}
async function doUndo() {
  const e = undoStack.pop();
  if (!e) return;
  try {
    await e.undo();
    redoStack.push(e);
    toast(`Undid: ${e.label}`, "ok");
    await refreshWork();
  } catch (err) { toast(err.message, "err"); }
  updateUndoButtons();
}
async function doRedo() {
  const e = redoStack.pop();
  if (!e) return;
  try {
    await e.redo();
    undoStack.push(e);
    toast(`Redid: ${e.label}`, "ok");
    await refreshWork();
  } catch (err) { toast(err.message, "err"); }
  updateUndoButtons();
}
document.getElementById("undoBtn").onclick = doUndo;
document.getElementById("redoBtn").onclick = doRedo;
document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault();
    doRedo();
  }
});

// Prevent double submissions: runs fn with the button disabled, re-enables after.
async function withBusy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.disabled = false;
  }
}

// Wrap a reversible mutation so it becomes undoable.
async function tracked(label, redoFn, undoFn) {
  await redoFn();
  pushHistory({ label, undo: undoFn, redo: redoFn });
  updateUndoButtons();
}
function snapshotOf(id) {
  const a = (window._acts || []).find((t) => String(t.id) === String(id));
  return a ? { ...a } : null;
}

// ---- Plan flow for the selected session ----
let workSessionId = null;
const PILL = { high: "High", medium: "Medium", "can-wait": "Can Wait" };

async function openSession(id, label) {
  workSessionId = id;
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoButtons();
  document.getElementById("workCard").hidden = false;
  document.getElementById("workTitle").textContent = label || `Session #${id}`;
  document.getElementById("currentDateLine").textContent = label || "";
  setStep("plan");
  showWStep(0);
  try {
    await refreshWork();
  } catch (err) { toast(err.message, "err"); }
}

async function refreshWork() {
  const acts = await api("/api/sessions/" + workSessionId + "/activities");
  window._acts = acts;
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
  const dismissed = window._dismissed || (window._dismissed = new Set());
  const visible = qs.filter((q) => !dismissed.has(`${q.activity_id}:${q.key}`));
  document.getElementById("questionList").innerHTML = visible
    .map((q, i) => {
      let extra = "";
      if (q.key === "effort") {
        extra = ` <label>Minutes: <input type="number" min="5" max="480" value="30" data-qcustom="${i}" style="width:5em" /></label>`
          + ` <button class="btn btn-ghost btn-small" data-qset="${i}" type="button">Set</button>`;
      } else if (q.key === "deadline") {
        extra = ` <label>Date: <input type="date" data-qdate="${i}" /></label>`
          + ` <button class="btn btn-ghost btn-small" data-qset="${i}" type="button">Set date</button>`;
      }
      return `<li>${q.question} <span class="sub">(optional)</span><br>${q.options
        .map((o) => `<button class="btn btn-ghost btn-small" data-q="${i}" data-v="${o}" type="button">${o}</button>`)
        .join(" ")}${extra} <button class="btn btn-ghost btn-small" data-qskip="${i}" type="button">Skip</button></li>`;
    })
    .join("") || "<li>No questions — everything is clear.</li>";
  window._qs = visible;
  try {
    const plan = await api("/api/sessions/" + workSessionId + "/plan");
    renderPlan(plan);
  } catch {
    document.getElementById("planList").innerHTML = "<li>No plan yet — press “Generate plan” below.</li>";
    document.getElementById("realityBox").innerHTML = "";
  }
  await refreshReview();
  if (!focusTick && !focusId) await resumeFocus();
  renderExec();
  if (isConfirmed()) syncNativeAlarms();
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

// Inline start/end editor for one timeline row. Duration is calculated from
// the difference and updates as either side changes. Saved back as canonical
// 24h; switching display modes never alters saved times.
function minuteOptions(sel) {
  let out = "";
  for (let m = 0; m < 60; m += 5) {
    const v = String(m).padStart(2, "0");
    out += `<option value="${v}"${v === sel ? " selected" : ""}>${v}</option>`;
  }
  return out;
}
function hourSelect(prefix, i, h24, is12) {
  let hours = "";
  if (is12) {
    const c = TimeFmt.hour12(h24);
    for (let h = 1; h <= 12; h++) hours += `<option${h === c.h12 ? " selected" : ""}>${h}</option>`;
    return `<label>Hour: <select data-${prefix}h="${i}" aria-label="Hour">${hours}</select></label> `
      + `<label><select data-${prefix}ap="${i}" aria-label="AM or PM"><option${c.ampm === "AM" ? " selected" : ""}>AM</option><option${c.ampm === "PM" ? " selected" : ""}>PM</option></select></label>`;
  }
  for (let h = 0; h < 24; h++) {
    const v = String(h).padStart(2, "0");
    hours += `<option value="${v}"${h === h24 ? " selected" : ""}>${v}</option>`;
  }
  return `<label>Hour: <select data-${prefix}h="${i}" aria-label="Hour (24-hour)">${hours}</select></label>`;
}
function timeEditorHTML(i, startHHMM, endHHMM) {
  const s = TimeFmt.parseHHMM(startHHMM);
  const e = TimeFmt.parseHHMM(endHHMM);
  const is12 = timeMode === "12";
  const mm = (v) => minuteOptions(String(v).padStart(2, "0"));
  return `<fieldset><legend>Set times</legend>`
    + `<div class="row"><span><strong>Start:</strong></span> ${hourSelect("ts", i, s.h24, is12)} `
    + `<label>Min: <select data-tsm="${i}" aria-label="Start minutes">${mm(s.m)}</select></label></div>`
    + `<div class="row"><span><strong>End:</strong></span> ${hourSelect("te", i, e.h24, is12)} `
    + `<label>Min: <select data-tem="${i}" aria-label="End minutes">${mm(e.m)}</select></label></div>`
    + `<p class="sub" data-tdur="${i}"></p>`
    + `<button class="btn btn-primary btn-small" data-tsave="${i}" type="button">Save times</button></fieldset>`;
}
function editorMinutes(prefix, i) {
  const root = document.querySelector(`[data-tform="${i}"]`);
  const h = root.querySelector(`[data-t${prefix}h]`).value;
  const m = root.querySelector(`[data-t${prefix}m]`).value;
  if (timeMode === "12") {
    const ap = root.querySelector(`[data-t${prefix}ap]`).value;
    return TimeFmt.parseHHMM(TimeFmt.from12(h, m, ap));
  }
  return { h24: Number(h), m: Number(m) };
}
function refreshEditorDuration(i) {
  try {
    const s = editorMinutes("s", i);
    const e = editorMinutes("e", i);
    const diff = (e.h24 * 60 + e.m) - (s.h24 * 60 + s.m);
    const el = document.querySelector(`[data-tdur="${i}"]`);
    if (!el) return;
    el.textContent = diff <= 0
      ? "End must be after start on the same day."
      : `Duration: ${Math.floor(diff / 60)}h ${diff % 60}m`;
  } catch { /* incomplete selection while editing */ }
}

document.getElementById("parseBtn").onclick = async () => {
  try {
    const text = document.getElementById("dump").value;
    if (!text.trim()) { toast("Write a few things first — one per line.", "err"); return; }
    const items = await api("/api/sessions/" + workSessionId + "/parse-preview", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    window._preview = items.map((it) => ({ ...it }));
    renderPreview();
    document.getElementById("previewBox").hidden = false;
    document.getElementById("previewBox").scrollIntoView({ block: "start" });
  } catch (err) { toast(err.message, "err"); }
};
function renderPreview() {
  document.getElementById("previewList").innerHTML = window._preview
    .map((it, i) => `<li>
      <label>Task: <input type="text" data-ptext="${i}" value="${it.text.replace(/"/g, "&quot;")}" /></label><br>
      <label>Priority:
      <select data-pprio="${i}">
        <option value="high"${it.priority === "high" ? " selected" : ""}>High</option>
        <option value="medium"${it.priority === "medium" ? " selected" : ""}>Medium</option>
        <option value="can-wait"${it.priority === "can-wait" ? " selected" : ""}>Can Wait</option>
      </select></label>
      <span class="sub">~${it.effort_min} min — ${it.reason}</span>
      <button class="btn btn-ghost btn-small" data-premove="${i}" type="button">Remove</button></li>`)
    .join("") || "<li>Nothing to review.</li>";
}
document.getElementById("cancelPreviewBtn").onclick = () => {
  window._preview = [];
  document.getElementById("previewBox").hidden = true;
};
document.getElementById("submitBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  try {
    const rows = document.querySelectorAll("#previewList [data-ptext]");
    const items = [];
    rows.forEach((input) => {
      const i = Number(input.dataset.ptext);
      const sel = document.querySelector(`[data-pprio="${i}"]`);
      items.push({ text: input.value, priority: sel ? sel.value : "medium", effort_min: window._preview[i].effort_min });
    });
    await api("/api/sessions/" + workSessionId + "/activities/bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    window._preview = [];
    document.getElementById("previewBox").hidden = true;
    document.getElementById("dump").value = "";
    setStep("clarify");
    showWStep(1);
    toast("Activities added.", "ok");
    await refreshWork();
    await refreshSessions();
  } catch (err) { toast(err.message, "err"); }
});
document.addEventListener("click", (e) => {
  const rm = e.target.dataset && e.target.dataset.premove;
  if (rm !== undefined && window._preview) {
    window._preview.splice(Number(rm), 1);
    renderPreview();
  }
});

// ---- Voice dictation: microphone appends a transcript to the dump.
// Shown only where the browser supports it; otherwise a keyboard hint shows.
// Never offered inside runtimes without support (e.g. Android WebView).
(function setupVoice() {
  const btn = document.getElementById("micBtn");
  const hint = document.getElementById("voiceHint");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.hidden = true;
    hint.hidden = false;
    return;
  }
  let rec = null, active = false;
  btn.onclick = () => {
    try {
      if (active && rec) {
        rec.stop();
        return;
      }
      rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        active = true;
        btn.classList.add("recording");
        btn.textContent = "⏺ Stop";
        toast("Listening — speak naturally.");
      };
      rec.onresult = (ev) => {
        const text = Array.from(ev.results).map((r) => r[0].transcript).join(" ").trim();
        if (!text) {
          toast("Didn't catch that — try again.", "err");
          return;
        }
        const dump = document.getElementById("dump");
        dump.value = (dump.value.trim() ? dump.value.trim() + " " : "") + text;
        toast("Added what you said — review it before continuing.", "ok");
      };
      rec.onerror = (ev) => {
        const kind = ev.error || "error";
        if (kind === "not-allowed" || kind === "service-not-allowed") {
          toast("Microphone blocked — allow it in the browser, or type instead.", "err");
        } else if (kind === "no-speech" || kind === "audio-capture") {
          toast("Didn't catch that — try again or type instead.", "err");
        } else {
          toast("Voice input failed — type instead.", "err");
        }
      };
      rec.onend = () => {
        active = false;
        btn.classList.remove("recording");
        btn.textContent = "🎤 Dictate";
      };
      rec.start();
    } catch (err) { toast(err.message || "Voice input failed.", "err"); }
  };
})();
document.getElementById("genPlanBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  try {
    const plan = await api("/api/sessions/" + workSessionId + "/plan", { method: "POST" });
    setStep("focus");
    renderPlan(plan);
  } catch (err) { toast(err.message, "err"); }
});
document.getElementById("confirmPlanBtn").onclick = () => {
  setConfirmed(!isConfirmed());
  if (isConfirmed()) {
    toast("Schedule confirmed — monitoring is now active.", "ok");
    showWStep(3);
  } else {
    try {
      if (window.Android && typeof window.Android.cancelAllAlarms === "function") {
        window.Android.cancelAllAlarms();
      }
    } catch { /* web timers already cleared by rebuild */ }
    toast("Monitoring paused.");
  }
  renderExec();
  syncNativeAlarms();
};

// Mirror the confirmed schedule to the native layer (Android APK only).
// No-ops everywhere else. Web page-open alarms remain the fallback.
async function syncNativeAlarms() {
  try {
    if (!window.Android || typeof window.Android.scheduleAlarms !== "function") return;
    if (!isConfirmed() || !workSessionId) return;
    const s = await api("/api/sessions/" + workSessionId);
    const dateKey = (s && s.day_date) || TimeFmt.todayKey();
    const [Y, M, D] = dateKey.split("-").map(Number);
    const atMs = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      return new Date(Y, M - 1, D, h, m, 0, 0).getTime();
    };
    const tl = (window._timeline || []).filter((t) => t.type === "work" || t.type === "break");
    const jobs = [];
    for (const t of tl) {
      if (t.type === "break") {
        jobs.push({ kind: "break", activityId: -1, title: "Break — stand, stretch, water", at: atMs(t.start_time) });
      } else {
        jobs.push({ kind: "start", activityId: t.activity_id, title: t.text, at: atMs(t.start_time) });
        jobs.push({ kind: "end", activityId: t.activity_id, title: t.text, at: atMs(t.end_time) });
      }
    }
    const clean = jobs.map((j) => ({ kind: j.kind, activityId: j.activityId, title: String(j.title || "").slice(0, 120), at: j.at }));
    const res = JSON.parse(window.Android.scheduleAlarms(JSON.stringify(clean)));
    if (res && res.ok) toast(`Native alarms set (${res.scheduled}).`, "ok");
  } catch {
    // Native layer unavailable or rejected: page-open alarms still apply.
  }
}
async function nativeStatusLine() {
  try {
    if (!window.Android || typeof window.Android.getAlarmStatus !== "function") return "";
    const st = JSON.parse(window.Android.getAlarmStatus());
    if (!st || !st.native) return "";
    const bits = [`${st.queued || 0} native alarm(s) queued`];
    if (st.exactAllowed === false) bits.push("exact alarms not allowed — open Settings to grant");
    if (st.notifications === false) bits.push("notifications off");
    return "Native: " + bits.join("; ") + ".";
  } catch {
    return "";
  }
}
document.getElementById("askAiBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  try {
    const r = await api("/api/sessions/" + workSessionId + "/ai-prioritise", { method: "POST" });
    window._ai = r.ranking;
    const source = r.provider === "gemini" ? "AI suggestion" : "Standard suggestion (AI unavailable)";
    document.getElementById("aiBox").innerHTML =
      `<p><strong>${source}</strong></p><ul class="items">` +
      r.ranking.map((x) => {
        const a = (window._acts || []).find((t) => t.id === x.id);
        return `<li>[${PILL[x.priority]}] ${a ? a.text : "a task"} — ${x.reason}</li>`;
      }).join("") +
      `</ul><div class="row"><button class="btn btn-primary" id="applyAiBtn" type="button">Apply suggestion</button> <span class="sub">Skips tasks you already decided yourself.</span></div>`;
    document.getElementById("applyAiBtn").onclick = async () => {
      try {
        let applied = 0, skipped = 0;
        for (const x of window._ai) {
          const cur = (window._acts || []).find((t) => t.id === x.id);
          if (cur && cur.priority_source === "user") {
            skipped += 1;
            continue;
          }
          await api("/api/activities/" + x.id, { method: "PATCH", body: JSON.stringify({ priority: x.priority, priority_source: "ai" }) });
          applied += 1;
        }
        toast(`Applied to ${applied} task(s)${skipped ? `, left ${skipped} you had decided` : ""} — adjust anything you disagree with.`, "ok");
        await refreshWork();
      } catch (err) { toast(err.message, "err"); }
    };
  } catch (err) { toast(err.message, "err"); }
});

// ---- Execution dashboard: date, now/next, countdown, per-task actions ----
function todayMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function workRows() {
  return (window._timeline || []).filter((t) => t.type === "work");
}
function renderExec() {
  const dateLabel = document.getElementById("currentDateLine").textContent || "";
  document.getElementById("execDate").textContent = dateLabel ? `Executing: ${dateLabel}` : "Today's execution";
  const rows = workRows().slice().sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
  const now = todayMin();
  const current = rows.find((t) => t.start_time <= fmtHM(now) && fmtHM(now) < t.end_time) || null;
  const next = rows.find((t) => t.start_time > fmtHM(now)) || null;
  const nm = (t) => `${TimeFmt.fmtTime(t.start_time, timeMode)}–${TimeFmt.fmtTime(t.end_time, timeMode)}`;
  document.getElementById("nowNext").innerHTML =
    `<p><strong>Now:</strong> ${current ? `${current.text} (${nm(current)})` : "—"}</p>` +
    `<p><strong>Next:</strong> ${next ? `${next.text} at ${TimeFmt.fmtTime(next.start_time, timeMode)}` : "—"}</p>`;
  const target = current ? current.end_time : (next ? next.start_time : null);
  document.getElementById("nextCountdown").textContent = target
    ? `${current ? "Ends" : "Starts"} in ${countdownTo(target)}`
    : "";
  document.getElementById("execList").innerHTML = rows.map((t) =>
    `<li><strong class="time">${TimeFmt.fmtTime(t.start_time, timeMode)}</strong> ${t.text} <span class="sub">(${nm(t)})</span><br>
    <button class="btn btn-ghost btn-small" data-exec-done="${t.activity_id}" type="button">Done</button>
    <button class="btn btn-ghost btn-small" data-exec-extend="${t.activity_id}" type="button">+15 min</button>
    <button class="btn btn-ghost btn-small" data-exec-plan="${t.activity_id}" type="button">Reschedule</button></li>`
  ).join("") || "<li>No scheduled tasks yet — generate the plan first.</li>";
  renderMissed(rows, now);
  rebuildAlarms(rows);
}
function fmtHM(mins) {
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function countdownTo(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  let diff = (h * 60 + m) - todayMin();
  if (diff < 0) diff = 0;
  const hh = Math.floor(diff / 60), mm = diff % 60;
  return hh ? `${hh}h ${mm}m` : `${mm}m`;
}
function renderMissed(rows, now) {
  const acts = window._acts || [];
  const st = new Map(acts.map((a) => [a.id, a.status]));
  const missed = rows.filter((t) => {
    const [h, m] = t.end_time.split(":").map(Number);
    return h * 60 + m < now - 5 && !["Completed", "Carried Forward"].includes(st.get(t.activity_id));
  });
  document.getElementById("missedBox").innerHTML = missed.length
    ? `<p><strong>Overdue:</strong> ${missed.map((t) => t.text).join("; ")} — complete, reschedule, or carry forward.</p>`
    : "";
}

// ---- Audible alarms (web-only): sound while this page is open.
// They CANNOT fire when the page is closed or the device sleeps that deeply —
// the UI says so, and anything beyond needs the native update (not installed).
const ALARM_KEY = "dpa-alarms";
function alarmPrefs() {
  try {
    return { start: true, end: true, breaks: true, repeat: false, tone: "chime", speech: false, ...JSON.parse(localStorage.getItem(ALARM_KEY) || "{}") };
  } catch {
    return { start: true, end: true, breaks: true, repeat: false, tone: "chime", speech: false };
  }
}
function saveAlarmPrefs(p) {
  localStorage.setItem(ALARM_KEY, JSON.stringify({ ...alarmPrefs(), ...p }));
}
let audioCtx = null;
function beep(freq, at, dur, type) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = audioCtx.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function playTone(name, times) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const seq = name === "buzz"
      ? [[196, 0, 0.35, "square"], [196, 0.45, 0.35, "square"]]
      : name === "soft"
        ? [[523, 0, 0.6, "sine"]]
        : [[880, 0, 0.18, "sine"], [1319, 0.2, 0.3, "sine"]];
    for (let r = 0; r < (times || 1); r++) {
      seq.forEach(([f, at, d, ty]) => beep(f, at + r * 1.2, d, ty));
    }
    return true;
  } catch {
    return false;
  }
}
let alarmTimers = [];
let pendingFires = [];
let alarmAcked = new Set();
let alarmRepeatTimer = null;
function alarmKey(kind, id, start) {
  return `${kind}:${id}:${start}`;
}
function fireAlarm(kind, label, id, start) {
  const key = alarmKey(kind, id, start);
  if (alarmAcked.has(key)) return;
  const prefs = alarmPrefs();
  playTone(prefs.tone, 1);
  speakAlarm(kind, label);
  notifyBreak(`${kind === "break" ? "Break" : label}`);
  const box = document.getElementById("alarmBox");
  box.innerHTML = `<p><strong>🔔 ${kind === "start" ? "Starting now" : kind === "end" ? "Time up" : "Break time"}:</strong> ${label} `
    + `<button class="btn btn-primary btn-small" data-alarm-ack="${key}" type="button">Acknowledge</button></p>`
    + `<p class="sub">Sounds only while this page is open.</p>`;
  if (prefs.repeat) {
    let n = 0;
    clearInterval(alarmRepeatTimer);
    alarmRepeatTimer = setInterval(() => {
      if (alarmAcked.has(key) || n++ >= 10) {
        clearInterval(alarmRepeatTimer);
        return;
      }
      playTone(prefs.tone, 1);
    }, 30000);
  }
}
function rebuildAlarms(rows) {
  alarmTimers.forEach(clearTimeout);
  alarmTimers = [];
  pendingFires = [];
  clearInterval(alarmRepeatTimer);
  const statusEl = document.getElementById("monitorState");
  // Monitoring runs ONLY for a confirmed schedule. Generating, editing or
  // rescheduling keeps an existing confirmation (times are rebuilt from the
  // latest plan), but nothing is scheduled before the user confirms.
  if (!isConfirmed()) {
    if (statusEl) statusEl.textContent = "Monitoring: off — confirm the schedule to activate alerts.";
    return;
  }
  const prefs = alarmPrefs();
  const nowMs = Date.now();
  const today = new Date();
  const atMs = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0, 0);
    return d.getTime();
  };
  const tl = (window._timeline || []).filter((t) => t.type === "work" || t.type === "break");
  for (const t of tl) {
    const isBreak = t.type === "break";
    const id = isBreak ? `b-${t.start_time}` : t.activity_id;
    const jobs = [];
    if (!isBreak && prefs.start) jobs.push(["start", t.start_time, `Starting: ${t.text}`]);
    if (!isBreak && prefs.end) jobs.push(["end", t.end_time, `Finished: ${t.text}`]);
    if (isBreak && prefs.breaks) jobs.push(["break", t.start_time, "Break — stand, stretch, water"]);
    for (const [kind, at, label] of jobs) {
      const key = alarmKey(kind, id, at);
      if (alarmAcked.has(key)) continue;
      const delay = atMs(at) - nowMs;
      if (delay <= 0 || delay > 12 * 3600 * 1000) continue;
      alarmTimers.push(setTimeout(() => fireAlarm(kind, t.text || label, id, at), delay));
      pendingFires.push(atMs(at));
    }
  }
  renderMonitorStatus();
  updateConfirmUI();
}
function renderMonitorStatus() {
  const el = document.getElementById("monitorState");
  if (!el) return;
  if (!alarmTimers.length) {
    el.textContent = "Monitoring: on — no upcoming alerts in the next 12 hours.";
  } else {
    const when = new Date(Math.min(...pendingFires)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    el.textContent = `Monitoring: on — ${alarmTimers.length} alert(s) scheduled, next at ${when}.`;
  }
  nativeStatusLine().then((extra) => {
    if (extra) el.textContent += " " + extra;
  });
}

// ---- Schedule confirmation: monitoring activates only after the user
// reviews and confirms. Stored per session on this device; regenerating or
// editing keeps the confirmation, pausing stops all timers.
function confirmKey() {
  return `dpa-confirmed:${workSessionId || "none"}`;
}
function isConfirmed() {
  try {
    return localStorage.getItem(confirmKey()) === "1";
  } catch {
    return false;
  }
}
function setConfirmed(on) {
  try {
    if (on) localStorage.setItem(confirmKey(), "1");
    else localStorage.removeItem(confirmKey());
  } catch { /* private mode: monitoring lasts this visit only */ }
  updateConfirmUI();
}
function updateConfirmUI() {
  const btn = document.getElementById("confirmPlanBtn");
  const state = document.getElementById("confirmState");
  if (!btn || !state) return;
  if (isConfirmed()) {
    btn.textContent = "Pause monitoring";
    state.textContent = "Schedule confirmed — alerts are active while this page is open.";
  } else {
    btn.textContent = "Confirm schedule";
    state.textContent = "Review the times above, then confirm to activate alerts.";
  }
}
const STATUSES = ["Not Started", "In Progress", "Completed", "Partially Completed", "Not Completed"];

// ---- Focus, review, carry-forward ----
// Sleep-proof countdown: the end moment is a fixed timestamp, so a sleeping
// laptop can't drift the timer. The server persists the start, so reload resumes.
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
  const groups = {};
  for (const a of acts) {
    (groups[a.status] = groups[a.status] || []).push(a);
  }
  const order = ["Completed", "Partially Completed", "In Progress", "Not Started", "Not Completed", "Carried Forward"];
  document.getElementById("reviewList").innerHTML = order
    .filter((st) => groups[st] && groups[st].length)
    .map((st) => `<li><strong>${st} (${groups[st].length})</strong><br>` + groups[st].map((a) =>
      `${a.text} <span class="sub">[${a.status}]</span><br>
      <label>Status:
      <select data-status="${a.id}">${STATUSES.map((s) => `<option${a.status === s ? " selected" : ""}>${s}</option>`).join("")}</select></label>`
    ).join("<br>") + `</li>`)
    .join("") || "<li>Nothing to review yet.</li>";
  const unfinished = acts.filter((a) => ["Not Started", "In Progress", "Partially Completed", "Not Completed"].includes(a.status));
  document.getElementById("carryList").innerHTML = unfinished
    .map((a) => `<li><label><input type="checkbox" data-carry="${a.id}" checked /> ${a.text}</label> <span class="sub">[${a.priority === "high" ? "High" : a.priority === "medium" ? "Medium" : "Can Wait"}]</span></li>`)
    .join("") || "<li>Nothing unfinished — nothing to carry.</li>";
  if (!document.getElementById("carryDate").value) {
    document.getElementById("carryDate").value = shiftDate(TimeFmt.todayKey(), 1);
  }
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
    window._focusAct = activity_id;
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
  const focused = (window._acts || []).find((a) => a.id === (window._focusAct || null));
  try {
    const done = await api("/api/focus/" + focusId, { method: "PATCH" });
    focusId = null;
    window._focusAct = null;
    document.getElementById("focusTimer").textContent = fmt(25 * 60);
    document.getElementById("breakBox").innerHTML = `<p><strong>Break:</strong> ${done.break}</p>`;
    notifyBreak(done.break);
    showTaskEnd(focused);
  } catch (err) { toast(err.message, "err"); }
  await refreshReview();
  try { await refreshWork(); } catch (err) { toast(err.message, "err"); }
}
// End-of-task choices: never auto-complete just because time ran out.
function showTaskEnd(activity) {
  const box = document.getElementById("taskEndBox");
  if (!activity) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `<p><strong>Time's up:</strong> ${activity.text}</p>
    <div class="row">
      <button class="btn btn-ghost btn-small" data-tend="Completed" type="button">Completed</button>
      <button class="btn btn-ghost btn-small" data-tend="Partially Completed" type="button">Partially done</button>
      <button class="btn btn-ghost btn-small" data-tend="Not Completed" type="button">Not done</button>
      <button class="btn btn-ghost btn-small" data-tend="extend" type="button">Keep going +25</button>
    </div>
    <label class="field-label" for="taskNote">Note (optional)</label>
    <input type="text" id="taskNote" placeholder="What happened?" />`;
  box.dataset.activity = activity.id;
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
    const acts = window._acts || [];
    const mins = s.focus_minutes || {};
    const recorded = acts.reduce((n, a) => n + (mins[a.id] || 0), 0);
    const planned = acts.reduce((n, a) => n + (a.effort_min || 0), 0);
    const parts = Object.entries(s.by_status).map(([st, n]) => `${n} ${st.toLowerCase()}`);
    document.getElementById("summaryBox").innerHTML =
      `<p><strong>Review:</strong> ${s.completed} of ${s.total} completed (${parts.join(", ")}). ` +
      `About ${recorded} focused minutes recorded against ${planned} planned.</p>`;
  } catch (err) { toast(err.message, "err"); }
};
document.getElementById("carryBtn").onclick = (e) => withBusy(e.currentTarget, async () => {
  try {
    const ids = Array.from(document.querySelectorAll("[data-carry]:checked")).map((c) => Number(c.dataset.carry));
    if (!ids.length) {
      toast("Tick at least one task to carry forward.", "err");
      return;
    }
    const date = document.getElementById("carryDate").value || shiftDate(TimeFmt.todayKey(), 1);
    const day = date === TimeFmt.todayKey() ? "today" : "tomorrow";
    const r = await api("/api/sessions/" + workSessionId + "/carry-forward", {
      method: "POST",
      body: JSON.stringify({ date, day, ids }),
    });
    document.getElementById("summaryBox").innerHTML =
      `<p><strong>Carried forward</strong> ${r.carried} item(s)${r.skipped ? ` (${r.skipped} already there, skipped)` : ""} into ${TimeFmt.fmtDateKey(date)}. Original history kept.</p>`;
    toast("Carried forward.", "ok");
    await refreshWork();
    await refreshReview();
    await refreshSessions();
  } catch (err) { toast(err.message, "err"); }
});
document.addEventListener("change", async (e) => {
  try {
    const id = e.target.dataset && e.target.dataset.status;
    if (id) {
      const before = snapshotOf(id);
      const after = e.target.value;
      await tracked(`status → ${after}`, async () => {
        await api("/api/activities/" + id, { method: "PATCH", body: JSON.stringify({ status: after }) });
      }, async () => {
        await api("/api/activities/" + id, { method: "PATCH", body: JSON.stringify({ status: before ? before.status : "Not Started" }) });
      });
      await refreshWork();
      return;
    }
    const prio = e.target.dataset && e.target.dataset.editPrio;
    if (prio) {
      const before = snapshotOf(prio);
      const after = e.target.value;
      await tracked(`priority → ${PILL[after] || after}`, async () => {
        await api("/api/activities/" + prio, { method: "PATCH", body: JSON.stringify({ priority: after }) });
      }, async () => {
        await api("/api/activities/" + prio, { method: "PATCH", body: JSON.stringify({ priority: before ? before.priority : "medium" }) });
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
    const qskip = e.target.dataset && e.target.dataset.qskip;
    if (qskip !== undefined && window._qs) {
      const item = window._qs[Number(qskip)];
      (window._dismissed = window._dismissed || new Set()).add(`${item.activity_id}:${item.key}`);
      await refreshWork();
      return;
    }
    const qset = e.target.dataset && e.target.dataset.qset;
    if (qset !== undefined && window._qs) {
      const item = window._qs[Number(qset)];
      const custom = document.querySelector(`[data-qcustom="${qset}"]`);
      const dateIn = document.querySelector(`[data-qdate="${qset}"]`);
      const value = custom ? custom.value : (dateIn ? dateIn.value : null);
      if (!value) {
        toast("Enter a value first — or Skip this question.", "err");
        return;
      }
      await api("/api/sessions/" + workSessionId + "/answers", {
        method: "POST",
        body: JSON.stringify({ activity_id: item.activity_id, key: item.key, value }),
      });
      await refreshWork();
      return;
    }
    const del = e.target.dataset && e.target.dataset.del;
    if (del) {
      const before = snapshotOf(del);
      let restoredId = null;
      await tracked(`remove “${before ? before.text : "task"}”`, async () => {
        if (restoredId) {
          await api("/api/activities/" + restoredId, { method: "DELETE" });
        } else {
          await api("/api/activities/" + del, { method: "DELETE" });
        }
      }, async () => {
        // Hard deletes can't bring back the row id; restore the full content instead.
        const saved = await api("/api/sessions/" + workSessionId + "/activities/bulk", {
          method: "POST",
          body: JSON.stringify({ items: [{
            text: before.text, priority: before.priority, effort_min: before.effort_min,
          }] }),
        });
        restoredId = saved[0].id;
        toast("Restored as a new entry (same text and details).", "ok");
      });
      await refreshWork();
      return;
    }
    const te = e.target.dataset && e.target.dataset.tedit;
    if (te !== undefined && window._timeline) {
      const row = window._timeline[Number(te)];
      if (row && row.type === "work") {
        const slot = document.querySelector(`[data-tform="${te}"]`);
        slot.innerHTML = " " + timeEditorHTML(Number(te), row.start_time, row.end_time);
        slot.hidden = false;
        refreshEditorDuration(Number(te));
        slot.querySelectorAll("select").forEach((sel) => {
          sel.addEventListener("change", () => refreshEditorDuration(Number(te)));
        });
      }
      return;
    }
    const ts = e.target.dataset && e.target.dataset.tsave;
    if (ts !== undefined && window._timeline) {
      const row = window._timeline[Number(ts)];
      try {
        if (!row || row.type !== "work") throw new Error("That row is not editable.");
        const s = editorMinutes("s", Number(ts));
        const e2 = editorMinutes("e", Number(ts));
        const startMin = s.h24 * 60 + s.m;
        let endMin = e2.h24 * 60 + e2.m;
        if (endMin <= startMin) {
          toast("End time must be after start time on the same day. Overnight tasks aren't supported yet — split them instead.", "err");
          return;
        }
        const start = `${String(s.h24).padStart(2, "0")}:${String(s.m).padStart(2, "0")}`;
        const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        // Prevent accidental overlaps with the other confirmed blocks.
        const clash = (window._timeline || []).find((t) =>
          t.type === "work" && t.activity_id !== row.activity_id &&
          startMin < (() => { const [h, m] = t.end_time.split(":").map(Number); return h * 60 + m; })() &&
          (() => { const [h, m] = t.start_time.split(":").map(Number); return h * 60 + m; })() < endMin
        );
        if (clash) {
          toast(`That overlaps "${clash.text}". Pick a time that doesn't clash.`, "err");
          return;
        }
        await tracked(`retime to ${TimeFmt.fmtTime(start, timeMode)}`, async () => {
          await api("/api/plan-items/" + row.plan_item_id, {
            method: "PATCH",
            body: JSON.stringify({ start_time: start, end_time: end }),
          });
        }, async () => {
          await api("/api/plan-items/" + row.plan_item_id, {
            method: "PATCH",
            body: JSON.stringify({ start_time: row.start_time, end_time: row.end_time }),
          });
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
      await openSession(sid, s ? sessionLabel(s) : `Session #${sid}`);
      return;
    }
    const ack = e.target.dataset && e.target.dataset.alarmAck;
    if (ack) {
      alarmAcked.add(ack);
      clearInterval(alarmRepeatTimer);
      document.getElementById("alarmBox").innerHTML = "";
      return;
    }
    const tend = e.target.dataset && e.target.dataset.tend;
    if (tend) {
      const box = document.getElementById("taskEndBox");
      const aid = Number(box.dataset.activity);
      const note = (document.getElementById("taskNote") || {}).value || "";
      try {
        if (tend === "extend") {
          await api("/api/sessions/" + workSessionId + "/focus", {
            method: "POST",
            body: JSON.stringify({ activity_id: aid, duration_min: 25 }),
          }).then((f) => {
            focusId = f.id;
            window._focusAct = aid;
            focusEndsAt = Date.now() + f.duration_min * 60000;
            runCountdown();
          });
          toast("Continuing for 25 more minutes.", "ok");
        } else {
          const before = snapshotOf(aid);
          await tracked(`task → ${tend}`, async () => {
            await api("/api/activities/" + aid, { method: "PATCH", body: JSON.stringify({ status: tend }) });
            if (note.trim()) {
              await api("/api/activities/" + aid, {
                method: "PATCH",
                body: JSON.stringify({ notes: ((before && before.notes) ? before.notes + " | " : "") + `End note: ${note.trim()}` }),
              });
            }
          }, async () => {
            await api("/api/activities/" + aid, { method: "PATCH", body: JSON.stringify({ status: before ? before.status : "Not Started" }) });
          });
          await refreshWork();
        }
        box.hidden = true;
        box.innerHTML = "";
      } catch (err) { toast(err.message, "err"); }
      return;
    }
    const done = e.target.dataset && e.target.dataset.execDone;
    if (done) {
      await tracked("mark completed", async () => {
        await api("/api/activities/" + done, { method: "PATCH", body: JSON.stringify({ status: "Completed" }) });
      }, async () => {
        const b = snapshotOf(done);
        await api("/api/activities/" + done, { method: "PATCH", body: JSON.stringify({ status: b ? b.status : "Not Started" }) });
      });
      await refreshWork();
      return;
    }
    const ext = e.target.dataset && e.target.dataset.execExtend;
    if (ext !== undefined && window._timeline) {
      const row = workRows().find((t) => String(t.activity_id) === String(ext));
      if (row && row.plan_item_id) {
        const [h, m] = row.end_time.split(":").map(Number);
        const total = h * 60 + m + 15;
        const end = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
        await api("/api/plan-items/" + row.plan_item_id, { method: "PATCH", body: JSON.stringify({ end_time: end }) });
        toast("Extended by 15 minutes.", "ok");
        await refreshWork();
      }
      return;
    }
    const goPlan = e.target.dataset && e.target.dataset.execPlan;
    if (goPlan !== undefined) {
      showWStep(2);
      return;
    }
  } catch (err) { toast(err.message, "err"); }
});

// ---- PWA: service worker + visible install ----
// Install buttons hide when already installed (standalone/PWA) or inside the
// Android WebView wrapper (no install concept there); browsers keep them.
function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || navigator.standalone === true;
}
function isWebView() {
  const ua = navigator.userAgent || "";
  return /; wv[;)]/.test(ua) || typeof window.Android !== "undefined";
}
if (isStandalone() || isWebView()) {
  document.querySelectorAll(".install-btn").forEach((b) => { b.hidden = true; });
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker not registered:", err);
    });
  });
}
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
});
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "") && !window.MSStream;
}
async function installApp() {
  if (deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    deferredInstall = null;
    return;
  }
  if (isIOS()) {
    toast("On iPhone/iPad: tap Share, then “Add to Home Screen”.", "ok");
    return;
  }
  toast("In your browser menu, choose “Install app” or “Add to Home screen”.", "ok");
}
document.querySelectorAll(".install-btn").forEach((b) => {
  b.addEventListener("click", installApp);
});

// ---- Boot: reset link, refreshed flag, draft restore, then route ----
(function bootInit() {
  // Draft + refresh feedback survive a Refresh-App reload.
  const draft = sessionStorage.getItem("dpa-draft");
  if (draft) {
    const dump = document.getElementById("dump");
    if (dump && !dump.value) dump.value = draft;
    sessionStorage.removeItem("dpa-draft");
  }
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset");
  if (resetToken) {
    pendingResetToken = resetToken;
    document.getElementById("resetConfirmError").hidden = true;
    showView("reset-confirm");
    return;
  }
  if (sessionStorage.getItem("dpa-refreshed")) {
    sessionStorage.removeItem("dpa-refreshed");
    toast("App refreshed — you're seeing the latest saved version.", "ok");
  }
})();
(async function boot() {
  try {
    await api("/api/users/me");
    await enterApp();
  } catch {
    showView("landing");
  }
})();
