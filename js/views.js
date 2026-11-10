// views.js: Home, Plan, Progress, Profile (specs form) and the lifter switcher.

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCK = { warmup: "Warm-up", power: "Power", speed: "Speed", strength: "Strength", accessory: "Accessory", mobility: "Cool-down" };

function doseText(i) {
  if (i.block === "warmup" || i.block === "mobility") return Math.round((i.time_sec || 0) / 60) + " min";
  if (i.time_sec) return `${i.sets} × ${i.time_sec}s`;
  if (i.distance && i.rep_min === 1) return `${i.sets} × ${i.distance}`;
  if (i.rep_min === 1 && i.rep_max === 1) return `${i.sets} reps`;
  return `${i.sets} × ${i.rep_min === i.rep_max ? i.rep_min : i.rep_min + "–" + i.rep_max}`;
}
const loadText = (lb, ex) => (lb ? `${lb} lb${ex && ex.per_hand ? " each" : ""}` : "");
const cuesList = ex => (ex.form_cues || "").split("|").map(c => `<li>${esc(c.trim())}</li>`).join("");

// ---------------- HOME ----------------
function renderHome() {
  const p = profile();
  if (!p) return show("who");
  const teen = isTeen(p), today = todayISO();
  $("me-chip").className = "me-chip" + (teen ? " teen" : "");
  $("me-chip").innerHTML = `<span class="av">${esc(p.avatar)}</span>${esc(p.name)} ▾`;
  const plan = activePlan(p.id), mine = sessionsOf(p.id), prog = progressOf(p.id);
  const lvlEnd = xpForLevel(prog.level + 1), lvlStart = xpForLevel(prog.level);
  const pct = Math.min(100, Math.round(100 * (prog.xp - lvlStart) / Math.max(1, lvlEnd - lvlStart)));
  const freeze = prog.freeze_month !== today.slice(0, 7);
  let h = `
  <div class="card lvl">
    <div class="lvl-badge"><small>LEVEL</small><b>${prog.level}</b></div>
    <div><div class="row between"><b>${esc(p.name)}</b><span class="muted small">${prog.xp} / ${lvlEnd} XP</span></div>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      <div class="row small"><span>🔥 <b>${prog.streak}</b> streak</span><span class="muted">${freeze ? "❄️ Freeze ready" : "❄️ Freeze used"}</span><span class="muted">best ${prog.longest || 0}</span></div></div>
  </div>`;

  if (!plan) h += `<div class="card"><h2>No plan yet</h2><p class="muted">Fill in your specs and The Forge builds it.</p><button class="btn" data-act="tab" data-tab="profile">Set up my plan</button></div>`;
  else {
    const up = nextDay(plan, mine), doneToday = mine.find(s => s.date === today);
    const peek = up.items.filter(i => i.block === "strength" || i.block === "power" || i.block === "speed").slice(0, 4);
    const inProgress = store.get(wKey(p.id, plan.id, up.day_id), null);
    h += `<div class="card c-${up.day_id}">
      <h3>${doneToday ? "Done today ✅ — next up" : "Today's workout"}</h3>
      <h2>${esc(up.name)}</h2>
      <p class="muted small" style="margin:0">${esc(up.focus)} · ${up.items.length} exercises · ~${up.est_minutes} min</p>
      <ul class="list">${peek.map(i => `<li>• ${esc(EX[i.exercise_id].name)}${i.load_lb ? ` <span class="muted">from ${loadText(i.load_lb, EX[i.exercise_id])}</span>` : ""}</li>`).join("")}</ul>
      <button class="btn huge${teen ? " teen" : ""}" data-act="start" data-day="${up.day_id}">${inProgress ? "Resume workout" : "Start workout"}</button>
      <div class="pills" style="margin-top:10px">${plan.days.filter(d => d.day_id !== up.day_id).map(d => `<button class="pill" data-act="start" data-day="${d.day_id}">${esc(d.name)}</button>`).join("")}</div>
    </div>`;
    h += weekStrip(plan, mine, today);
  }

  // coach card: latest write-up + weekly family recap
  const lastS = mine[0];
  const wk = mondayOf(today), weekRecap = DB.Recaps["week:" + wk];
  h += `<div class="card coach-card"><h3>🧢 Coach</h3>
    ${lastS && lastS.recap ? `<p class="recap" style="margin:0 0 10px">${esc(lastS.recap)}</p><p class="muted small" style="margin:-4px 0 10px">— after ${esc(lastS.day_name)}, ${esc(lastS.date)}</p>` : `<p class="muted" style="margin:0 0 10px">Ask anything about today's lifts, form, soreness, or how to get faster.</p>`}
    <div class="pills"><button class="btn sm${teen ? " teen" : ""}" data-act="tab" data-tab="coach">Ask Coach</button>
    <button class="btn sm ghost" data-act="week-recap">${coachOn() ? (weekRecap ? "This week's recap" : "Write this week's recap") : "Weekly recap in Claude"}</button></div></div>`;

  // family
  const others = profiles().filter(o => o.id !== p.id);
  if (others.length) {
    h += `<div class="card"><h3>Family${coaching() ? "" : ` <span class="muted small" style="font-weight:500">· tap to see their schedule and log for them</span>`}</h3>` + others.map(o => {
      const op = progressOf(o.id), last = sessionsOf(o.id)[0];
      return `<button class="fam" data-act="as-on" data-id="${o.id}"><span class="av">${esc(o.avatar)}</span><div class="grow">
        <div class="row"><b>${esc(o.name)}</b><span class="pill">Lv ${op.level}</span><span class="small">🔥 ${op.streak}</span></div>
        <small>${last ? `${last.date === today ? "Today" : esc(last.date)}: ${esc(last.day_name)} (+${last.xp} XP)${(last.prs || []).length ? " · 🏆 " + last.prs.length + " PR" : ""}` : "No workouts yet"}</small>
        ${op.badges.length ? `<div>${op.badges.slice(-8).map(b => (BADGE[b] || {}).emoji || "").join(" ")}</div>` : ""}</div><span class="fam-go">Schedule &amp; log ›</span></button>`;
    }).join("") + `</div>`;
  }

  // PRs + badges
  const prs = setsOf(p.id).filter(s => s.is_pr).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  if (prs.length) h += `<div class="card"><h3>🏆 Recent PRs</h3>${prs.map(s => `<div class="row between small"><span>${esc(EX[s.exercise_id] ? EX[s.exercise_id].name : s.exercise_id)}</span><b>${s.result ? s.result + (EX[s.exercise_id].measure === "sec" ? "s" : '"') : s.weight + " × " + s.reps}</b></div>`).join("")}</div>`;
  if (prog.badges.length) h += `<div class="pills">${prog.badges.map(b => BADGE[b] ? `<span class="pill" title="${esc(BADGE[b].desc)}">${BADGE[b].emoji} ${esc(BADGE[b].name)}</span>` : "").join("")}</div>`;
  if (!SERVER) h += `<p class="muted small center">Saved on this phone only. Connect the Google Sheet to share between phones (see README).</p>`;
  $("home-body").innerHTML = h;
}

function weekStrip(plan, mine, today) {
  const wk = mondayOf(today);
  const doneDays = new Set(mine.filter(s => s.date >= wk).map(s => WEEK[(new Date(s.date + "T12:00:00").getDay() + 6) % 7]));
  const todayW = WEEK[(new Date(today + "T12:00:00").getDay() + 6) % 7];
  return `<div class="week">${WEEK.map(w => {
    const slot = plan.schedule.find(s => s.weekday === w);
    const cls = [doneDays.has(w) ? "done" : slot ? (slot.kind === "speed" ? "ath" : "lift") : "", w === todayW ? "today" : ""].join(" ");
    return `<div class="${cls}"><b>${w}</b>${doneDays.has(w) ? "✓" : slot ? (slot.kind === "speed" ? "Athletic" : "Lift") : "Rest"}</div>`;
  }).join("")}</div>`;
}

ACTIONS.tab = el => show(el.dataset.tab);
ACTIONS["back-home"] = () => show("home");
$("me-chip").addEventListener("click", () => pickLifter());
function pickLifter() {
  openModal(`<h2>Who's training?</h2>${profiles().map(o => `<button class="who-btn${isTeen(o) ? " teen" : ""}" data-act="be" data-id="${o.id}"><span class="av">${esc(o.avatar)}</span><span>${esc(o.name)}<small>${isTeen(o) ? "Athlete" : "Adult"} · Level ${progressOf(o.id).level}</small></span></button>`).join("")}
    <button class="btn ghost" data-act="new-profile">+ Add a lifter</button>`);
}
ACTIONS.be = el => { ME = el.dataset.id; store.set("af:me", ME); coachAs(null); closeModal(); show("home"); };
ACTIONS["as-on"] = el => { coachAs(el.dataset.id); show("home"); $("home-body").scrollTop = 0; toast(`Coaching ${profile().name}`); };
ACTIONS["as-off"] = () => { coachAs(null); show("home"); };
ACTIONS["new-profile"] = () => { closeModal(); show("profile", { fresh: true }); };

// ---------------- PLAN ----------------
function renderPlan() {
  const p = profile(), plan = p && activePlan(p.id);
  if (!plan) { $("plan-body").innerHTML = `<div class="card"><h2>No plan yet</h2><button class="btn" data-act="tab" data-tab="profile">Enter my specs</button></div>`; return; }
  const teen = isTeen(p);
  let h = `<div><h2 style="font-family:var(--title);margin:0">${esc(plan.name)}</h2><p class="muted small" style="margin:2px 0 0">${esc(plan.description)}</p></div>
    <div class="sched">${WEEK.map(w => { const s = plan.schedule.find(x => x.weekday === w), fixed = plan.days.find(d => d.suggested_weekday === w);
      return `<div class="${s ? (s.kind === "speed" ? "ath" : "lift") : ""}"><b>${w}</b>${s ? (fixed ? esc(fixed.name.replace(" Day", "")) : "Lift") : "Rest"}</div>`; }).join("")}</div>`;
  if (!plan.days.some(d => d.kind === "strength" && d.suggested_weekday)) h += `<p class="muted small" style="margin:-4px 0 0">Lifting days rotate Squat → Bench → Clean → Deadlift. Home always shows the next one.</p>`;
  h += `<details class="rules"><summary>${teen ? "🛡️" : "📈"} How this plan works</summary><ul>${plan.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul></details>`;
  plan.days.forEach((d, n) => {
    h += `<div class="card c-${d.day_id}"><div class="row between"><div class="grow"><span class="pill">${d.suggested_weekday || "Day " + (n + 1)}</span>
      <h2 style="margin-top:6px">${esc(d.name)}</h2><p class="muted small" style="margin:0">${esc(d.focus)} · ~${d.est_minutes} min</p></div>
      <button class="btn sm${teen ? " teen" : ""}" data-act="start" data-day="${d.day_id}">Start</button></div><div style="margin-top:8px">` +
      d.items.map(i => { const ex = EX[i.exercise_id];
        return `<div class="ex"><div class="ex-top"><span><span class="n">${i.order}.</span>${esc(ex.name)}</span><span class="dose">${doseText(i)}</span></div>
        <div class="ex-meta">${BLOCK[i.block]}${i.load_lb ? ` · start <b>${loadText(i.load_lb, ex)}</b>` : ""}${i.rest_sec ? " · rest " + fmtRest(i.rest_sec) : ""}${i.notes ? "<br>" + esc(i.notes) : ""}</div>
        ${howBlock(ex, false, "cues how")}
        <details class="cues"><summary>Form cues</summary><ul>${cuesList(ex)}</ul></details></div>`; }).join("") + `</div></div>`;
  });
  $("plan-body").innerHTML = h;
}
ACTIONS.regen = () => {
  const p = profile(); if (!p) return;
  if (!confirm("Rebuild the plan from your current specs? Your logged history stays.")) return;
  savePlan(p); toast("Plan rebuilt 💪"); show("plan");
};
function savePlan(p) {
  const old = rows("Plans").filter(x => x.profile_id === p.id && x.active).map(x => Object.assign({}, x, { active: false }));
  const plan = generatePlan(p, uid("plan_"));
  put("Plans", old.concat([plan]));
  return plan;
}

// ---------------- PROGRESS ----------------
function spark(vals, lowerBetter) {
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals), w = 100, hgt = 30;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${max === min ? hgt / 2 : lowerBetter ? 2 + ((v - min) / (max - min)) * (hgt - 4) : hgt - 2 - ((v - min) / (max - min)) * (hgt - 4)}`).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline class="spark" points="${pts}"/></svg>`;
}
function renderProgress() {
  const p = profile(); if (!p) return;
  const teen = isTeen(p), sets = setsOf(p.id), sess = sessionsOf(p.id), prog = progressOf(p.id);
  let h = `<div class="card"><h3>${teen ? "Best clean sets" : "Core lifts · best set & est. 1RM"}</h3><div class="lifts">`;
  CORE_LIFTS.forEach(l => {
    const xs = sets.filter(s => EX[s.exercise_id] && EX[s.exercise_id].core_lift === l && EX[s.exercise_id].measure === "lb" && s.weight > 0 && (EX[s.exercise_id].is_core_lift || ["goblet_squat", "trap_bar_deadlift", "db_bench_press", "hang_clean_pull", "hang_power_clean"].includes(s.exercise_id)));
    const top = xs.slice().sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0];
    const bySess = {}; xs.forEach(s => { const v = e1rm(s.weight, s.reps); if (!bySess[s.date] || v > bySess[s.date]) bySess[s.date] = v; });
    const series = Object.keys(bySess).sort().map(d => bySess[d]);
    h += `<div class="lift-tile"><small>${LIFT_NAME[l]}</small>${top ? `<b>${top.weight} × ${top.reps}</b><span>${esc(EX[top.exercise_id].name)}${!teen && prog.best[l] ? " · e1RM " + prog.best[l] : ""}</span>${spark(series)}` : `<span>No sets yet</span>`}</div>`;
  });
  h += `</div></div>`;
  const ms = metricsOf(p.id), drills = [...new Set(ms.map(m => m.drill))];
  h += `<div class="card"><h3>Speed, agility & jumps</h3>${drills.length ? "" : `<p class="muted small" style="margin:0">Type a time or distance on sprint, agility and jump drills and they'll track here.</p>`}` +
    drills.map(d => { const xs = ms.filter(m => m.drill === d), sec = xs[0].unit === "sec", vals = xs.map(m => m.value), best = sec ? Math.min(...vals) : Math.max(...vals), u = sec ? "s" : '"';
      return `<div class="drill-row"><span>${esc(d)}</span>${spark(vals, sec) || "<span></span>"}<span><b>${best}${u}</b> <span class="muted small">last ${vals[vals.length - 1]}${u}</span></span></div>`; }).join("") + `</div>`;
  h += `<div class="card"><h3>Recent sessions</h3>${sess.length ? "" : `<p class="muted small" style="margin:0">No workouts yet.</p>`}` +
    sess.slice(0, 15).map(s => `<div class="sess"><div class="row between"><b>${esc(s.day_name)}</b><span class="muted small">${esc(s.date)}</span></div>
      <div class="muted small">${s.duration_min || 0} min · +${s.xp || 0} XP${(s.prs || []).length ? " · 🏆 " + s.prs.map(esc).join(", ") : ""}</div>
      ${s.notes ? `<div class="small">📝 ${esc(s.notes)}</div>` : ""}${s.parent_notes ? `<div class="pn">👨 ${esc(s.parent_notes)}</div>` : ""}
      ${s.recap ? `<details class="small"><summary class="muted">🧢 Coach's write-up</summary><p class="recap">${esc(s.recap)}</p></details>` : ""}</div>`).join("") + `</div>`;
  $("progress-body").innerHTML = h;
}

// ---------------- PROFILE / SPECS ----------------
const AVATARS = ["🏋️", "⚡", "🦍", "🐺", "🦅", "🔥", "🐻", "🚀", "🐶", "⚾"];
let FORM = null;
function renderProfile(arg = {}) {
  if (!arg.keep || !FORM) {
    const p = arg.fresh ? null : profile();
    if (p) FORM = JSON.parse(JSON.stringify(p));
    else {
      const t = profiles().some(x => x.type === "adult") ? "teen" : "adult";
      FORM = { fresh: true, id: uid("p_"), name: "", type: t, age: "", bodyweight: "", experience: "beginner",
        lifts: { squat: {}, bench: {}, clean: {}, deadlift: {} }, days_per_week: t === "teen" ? 3 : 4, session_length: 60,
        goal: t === "teen" ? "sports" : "balanced", form_focus_mode: t === "teen", avatar: t === "teen" ? "⚡" : "🏋️" };
    }
  }
  $("profile-title").textContent = FORM.fresh ? "New lifter" : coaching() ? FORM.name + "'s specs" : "My specs";
  const f = FORM, teen = f.type === "teen";
  const seg = (key, opts) => `<div class="seg" style="grid-template-columns:repeat(${opts.length},1fr)">${opts.map(([v, l]) => `<button data-act="seg" data-k="${key}" data-v="${v}" class="${String(f[key]) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const prog = progressOf(f.id);
  $("profile-body").innerHTML = `
  <div class="card"><h3>Who</h3>
    ${seg("type", [["adult", "Adult"], ["teen", "Teen / Athlete"]])}
    <div class="field" style="margin-top:10px"><label>Name</label><input id="f-name" value="${esc(f.name)}" autocomplete="off"></div>
    <div class="avs" style="margin-top:10px">${AVATARS.map(a => `<button data-act="avatar" data-v="${a}" class="${a === f.avatar ? "on" : ""}">${a}</button>`).join("")}</div>
    <div class="grid2" style="margin-top:10px"><div class="field"><label>Age</label><input id="f-age" type="number" inputmode="numeric" value="${esc(f.age)}"></div>
    <div class="field"><label>Bodyweight (lb)</label><input id="f-bw" type="number" inputmode="decimal" value="${esc(f.bodyweight)}"></div></div>
    <div class="field" style="margin-top:10px"><label>Lifting experience</label>${seg("experience", [["beginner", "Beginner"], ["intermediate", "Intermediate"]])}</div>
    ${teen ? `<p class="muted small" style="margin:6px 0 0">Beginner uses technique versions (goblet squat, DB bench, hang clean pulls, trap-bar). Switch to Intermediate once the barbell lifts look smooth.</p>` : ""}
  </div>
  <div class="card"><h3>${teen ? "Best recent sets (optional)" : "Best recent sets"}</h3>
    <p class="muted small" style="margin:0 0 8px">${teen ? "Only if he's done the barbell lift lately with good form. Blank = safe starting weights." : "A recent hard set, like 225 × 5. Blank = bodyweight-based starting weights."}</p>
    ${CORE_LIFTS.map(l => `<div class="liftrow" style="margin-top:6px"><b>${LIFT_NAME[l]}</b><input id="f-${l}-w" type="number" inputmode="decimal" placeholder="lb" value="${esc((f.lifts[l] || {}).weight || "")}"><span class="muted">×</span><input id="f-${l}-r" type="number" inputmode="numeric" placeholder="reps" value="${esc((f.lifts[l] || {}).reps || "")}"></div>`).join("")}
  </div>
  <div class="card"><h3>Schedule & goal</h3>
    <div class="field"><label>Days per week</label>${seg("days_per_week", [[2, "2"], [3, "3"], [4, "4"], [5, "5"]])}</div>
    <div class="field" style="margin-top:10px"><label>Session length</label>${seg("session_length", [[45, "45m"], [60, "60m"], [75, "75m"], [90, "90m"]])}</div>
    <div class="field" style="margin-top:10px"><label>Primary goal</label>${seg("goal", [["strength", "Strength"], ["sports", "Sports"], ["balanced", "Balanced"]])}</div>
    <button class="toggle${f.form_focus_mode ? " on" : ""}" data-act="ff" style="margin-top:12px;width:100%"><span><b>Form-focus mode</b><br><span class="muted small">Rate form on every lift; cues open by default</span></span><i></i></button>
  </div>
  <p class="err" id="f-err" hidden></p>
  <button class="btn big${teen ? " teen" : ""}" data-act="save-profile">${f.fresh ? "Create & build my plan" : "Save & rebuild plan"}</button>
  ${f.fresh ? "" : `<button class="btn ghost" data-act="save-profile" data-keep="1">Save without changing the plan</button>`}
  ${f.fresh ? "" : `<div class="card"><h3>Lifetime</h3><div class="small">Level ${prog.level} · ${prog.xp} XP · longest streak ${prog.longest || 0} · ${sessionsOf(f.id).length} workouts</div></div>
  <div class="card"><h3>This phone</h3><div class="small">${SERVER ? (pin() ? "Connected to the Google Sheet." : "Not signed in.") : "Not connected to a Google Sheet — data stays on this phone."}${store.get("af:out", []).length ? " Some changes are waiting to sync." : ""}</div>
    <div class="pills" style="margin-top:8px"><button class="btn sm ghost" data-act="switch">Switch lifter</button>${SERVER ? `<button class="btn sm ghost" data-act="sync-now">Sync now</button>` : ""}</div></div>`}`;
}
function readForm() {
  const v = id => $(id).value.trim();
  FORM.name = v("f-name"); FORM.age = +v("f-age") || ""; FORM.bodyweight = +v("f-bw") || "";
  CORE_LIFTS.forEach(l => { const w = +v(`f-${l}-w`) || 0; FORM.lifts[l] = { weight: w, reps: +v(`f-${l}-r`) || (w ? 5 : 0) }; });
}
ACTIONS.seg = el => {
  readForm(); FORM[el.dataset.k] = isNaN(+el.dataset.v) ? el.dataset.v : +el.dataset.v;
  if (el.dataset.k === "type" && FORM.fresh) { const t = FORM.type === "teen"; FORM.form_focus_mode = t; FORM.goal = t ? "sports" : "balanced"; FORM.avatar = t ? "⚡" : "🏋️"; }
  renderProfile({ keep: true });
};
ACTIONS.avatar = el => { readForm(); FORM.avatar = el.dataset.v; renderProfile({ keep: true }); };
ACTIONS.ff = () => { readForm(); FORM.form_focus_mode = !FORM.form_focus_mode; renderProfile({ keep: true }); };
ACTIONS.switch = () => pickLifter();
ACTIONS["sync-now"] = () => sync().then(() => { toast("Synced ✓"); refresh(); }).catch(e => toast(errText(e)));
ACTIONS["save-profile"] = el => {
  readForm();
  const err = m => { $("f-err").textContent = m; $("f-err").hidden = false; };
  if (!FORM.name) return err("Name is required.");
  if (!(FORM.age >= 8 && FORM.age <= 90)) return err("Enter a valid age.");
  if (!(FORM.bodyweight >= 50)) return err("Enter bodyweight in pounds.");
  const p = Object.assign({}, FORM); delete p.fresh;
  put("Profiles", p);
  const wasFresh = FORM.fresh;
  if (!el.dataset.keep || wasFresh) savePlan(p);
  if (wasFresh || !coaching()) { ME = p.id; store.set("af:me", ME); coachAs(null); }
  FORM = null;
  toast(wasFresh ? "Plan built 💪" : "Saved");
  show(el.dataset.keep ? "home" : "plan");
};
