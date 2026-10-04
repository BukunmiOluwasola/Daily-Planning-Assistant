// Phase 4 frontend: auth, sessions, preference, history. No other features yet.
async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...(opts || {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ("Request failed: " + res.status));
  return body;
}

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
        return `<li><strong>#${s.id} · ${s.day}</strong> <span class="sub">${s.created_at}</span><br><span class="sub">${counts || "no activities yet"}</span> <button data-open="${s.id}">Open</button></li>`;
      })
      .join("") || "<li>No sessions yet.</li>";
  } catch {
    document.getElementById("sessionList").innerHTML = "<li>Sign in to see sessions.</li>";
  }
}

async function refresh() {
  await refreshMe();
  await refreshSessions();
}

document.getElementById("signupBtn").onclick = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  await api("/api/users/signup", { method: "POST", body: JSON.stringify({ email, password }) });
  await refresh();
};
document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  await api("/api/users/login", { method: "POST", body: JSON.stringify({ email, password }) });
  await refresh();
};
document.getElementById("logoutBtn").onclick = async () => {
  await api("/api/users/logout", { method: "POST" });
  await refresh();
};
document.getElementById("createSessionBtn").onclick = async () => {
  const day = document.getElementById("day").value;
  await api("/api/sessions", { method: "POST", body: JSON.stringify({ day }) });
  await refreshSessions();
};
document.getElementById("savePeriodBtn").onclick = async () => {
  const productive_period = document.getElementById("period").value;
  await api("/api/sessions/preference", {
    method: "PUT",
    body: JSON.stringify({ productive_period }),
  });
  await refreshMe();
};
document.getElementById("refreshBtn").onclick = refresh;

async function refresh() {
  await refreshMe();
  await refreshSessions();
}

// ---- Phase 5: plan flow for the selected session ----
let workSessionId = null;
const PILL = { high: "High", medium: "Medium", "can-wait": "Can Wait" };

async function openSession(id, day) {
  workSessionId = id;
  document.getElementById("workCard").style.display = "";
  document.getElementById("workTitle").textContent = "Session #" + id + " · " + day;
  await refreshWork();
}

async function refreshWork() {
  const acts = await api("/api/sessions/" + workSessionId + "/activities");
  document.getElementById("activityList").innerHTML = acts
    .map((a) => `<li><strong>[${PILL[a.priority]}]</strong> ${a.text} <span class="sub">(~${a.effort_min} min — ${a.reason})</span><br>
      <select data-edit-prio="${a.id}">
        <option value="high"${a.priority === "high" ? " selected" : ""}>High</option>
        <option value="medium"${a.priority === "medium" ? " selected" : ""}>Medium</option>
        <option value="can-wait"${a.priority === "can-wait" ? " selected" : ""}>Can Wait</option>
      </select>
      <button data-del="${a.id}">Remove</button></li>`)
    .join("") || "<li>Parse a brain dump first.</li>";
  const qs = await api("/api/sessions/" + workSessionId + "/questions");
  document.getElementById("questionList").innerHTML = qs
    .map((q, i) => `<li>${q.question}<br>${q.options
      .map((o) => `<button data-q="${i}" data-v="${o}">${o}</button>`)
      .join(" ")}</li>`)
    .join("") || "<li>No questions — everything is clear.</li>";
  window._qs = qs;
  try {
    const plan = await api("/api/sessions/" + workSessionId + "/plan");
    renderPlan(plan);
  } catch {
    document.getElementById("planList").innerHTML = "<li>No plan yet.</li>";
    document.getElementById("realityBox").innerHTML = "";
  }
  await refreshReview();
}

function renderPlan(plan) {
  const r = plan.reality;
  document.getElementById("realityBox").innerHTML =
    `<p><strong>Reality check:</strong> ${r.message}</p>`;
  document.getElementById("planList").innerHTML = plan.timeline
    .map((t) =>
      t.type === "break"
        ? `<li>☕ ${t.start_time} — ${t.text} (${t.start_time}–${t.end_time})</li>`
        : `<li><strong>${t.start_time}</strong> [${PILL[t.priority]}] ${t.text} (${t.start_time}–${t.end_time})</li>`
    )
    .join("");
}

document.getElementById("parseBtn").onclick = async () => {
  const text = document.getElementById("dump").value;
  await api("/api/sessions/" + workSessionId + "/parse", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  document.getElementById("dump").value = "";
  await refreshWork();
  await refreshSessions();
};
document.getElementById("genPlanBtn").onclick = async () => {
  const plan = await api("/api/sessions/" + workSessionId + "/plan", { method: "POST" });
  renderPlan(plan);
};
document.getElementById("askAiBtn").onclick = async () => {
  const r = await api("/api/sessions/" + workSessionId + "/ai-prioritise", { method: "POST" });
  window._ai = r.ranking;
  document.getElementById("aiBox").innerHTML =
    `<p><strong>AI suggestion</strong> <span class="sub">(via ${r.provider})</span></p><ul class="items">` +
    r.ranking.map((x) => `<li>[${PILL[x.priority]}] activity #${x.id} — ${x.reason}</li>`).join("") +
    `</ul><div class="row"><button class="btn btn-primary" id="applyAiBtn">Apply AI priorities</button></div>`;
  document.getElementById("applyAiBtn").onclick = async () => {
    for (const x of window._ai) {
      await api("/api/activities/" + x.id, { method: "PATCH", body: JSON.stringify({ priority: x.priority }) });
    }
    await refreshWork();
  };
};

// ---- Phase 6: focus, review, carry-forward ----
const STATUSES = ["Not Started", "In Progress", "Completed", "Partially Completed", "Not Completed"];
let focusId = null, focusLeft = 25 * 60, focusTick = null;

function fmt(s) {
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

async function refreshReview() {
  const acts = await api("/api/sessions/" + workSessionId + "/activities");
  document.getElementById("focusPick").innerHTML = acts
    .map((a) => `<option value="${a.id}">${a.text}</option>`)
    .join("");
  document.getElementById("reviewList").innerHTML = acts
    .map((a) => `<li>${a.text} <span class="sub">[${a.status}]</span><br>
      <select data-status="${a.id}">${STATUSES.map((s) => `<option${a.status === s ? " selected" : ""}>${s}</option>`).join("")}</select></li>`)
    .join("") || "<li>Nothing to review yet.</li>";
}

document.getElementById("focusStartBtn").onclick = async () => {
  if (focusTick) return;
  const activity_id = Number(document.getElementById("focusPick").value);
  const f = await api("/api/sessions/" + workSessionId + "/focus", {
    method: "POST",
    body: JSON.stringify({ activity_id }),
  });
  focusId = f.id;
  focusLeft = f.duration_min * 60;
  document.getElementById("breakBox").innerHTML = "";
  focusTick = setInterval(() => {
    focusLeft--;
    if (focusLeft <= 0) {
      clearInterval(focusTick);
      focusTick = null;
      endFocus();
      return;
    }
    document.getElementById("focusTimer").textContent = fmt(focusLeft);
  }, 1000);
};
async function endFocus() {
  if (!focusId) return;
  const done = await api("/api/focus/" + focusId, { method: "PATCH" });
  focusId = null;
  document.getElementById("focusTimer").textContent = fmt(25 * 60);
  document.getElementById("breakBox").innerHTML = `<p><strong>Break:</strong> ${done.break}</p>`;
  await refreshReview();
  await refreshWork();
}
document.getElementById("focusEndBtn").onclick = async () => {
  if (focusTick) {
    clearInterval(focusTick);
    focusTick = null;
  }
  await endFocus();
};
document.getElementById("reviewBtn").onclick = async () => {
  const s = await api("/api/sessions/" + workSessionId + "/review", { method: "POST" });
  document.getElementById("summaryBox").innerHTML =
    `<p><strong>Review:</strong> ${s.completed} of ${s.total} completed (${JSON.stringify(s.by_status)}).</p>`;
};
document.getElementById("carryBtn").onclick = async () => {
  const r = await api("/api/sessions/" + workSessionId + "/carry-forward", {
    method: "POST",
    body: JSON.stringify({}),
  });
  document.getElementById("summaryBox").innerHTML =
    `<p><strong>Carried forward</strong> ${r.carried} item(s) into session #${r.new_session_id}.</p>`;
  await refreshWork();
  await refreshReview();
  await refreshSessions();
};
document.addEventListener("change", async (e) => {
  const id = e.target.dataset && e.target.dataset.status;
  if (id) {
    await api("/api/activities/" + id, {
      method: "PATCH",
      body: JSON.stringify({ status: e.target.value }),
    });
  }
});
document.addEventListener("click", async (e) => {
  const q = e.target.dataset && e.target.dataset.q;
  if (q !== undefined && window._qs) {
    const item = window._qs[Number(q)];
    await api("/api/sessions/" + workSessionId + "/answers", {
      method: "POST",
      body: JSON.stringify({ activity_id: item.activity_id, key: item.key, value: e.target.dataset.v }),
    });
    await refreshWork();
  }
  const del = e.target.dataset && e.target.dataset.del;
  if (del) {
    await api("/api/activities/" + del, { method: "DELETE" });
    await refreshWork();
  }
  const sid = e.target.dataset && e.target.dataset.open;
  if (sid) {
    const all = await api("/api/sessions/history/all");
    const s = all.find((x) => String(x.id) === String(sid));
    await openSession(sid, s ? s.day : "");
  }
});
document.addEventListener("change", async (e) => {
  const id = e.target.dataset && e.target.dataset.editPrio;
  if (id) {
    await api("/api/activities/" + id, {
      method: "PATCH",
      body: JSON.stringify({ priority: e.target.value }),
    });
    await refreshWork();
  }
});

refresh();
