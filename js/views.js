// views.js: Home (challenges, head-to-head), Plan, Progress (charts), History, Profile (specs form) and the lifter switcher.

const TAGLINE = "As iron sharpens iron, so one person sharpens another.";
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
  if (!p) return enter();
  const teen = isTeen(p), today = todayISO();
  $("me-chip").className = "me-chip" + (teen ? " teen" : "");
  $("me-chip").innerHTML = `<span class="av">${esc(p.avatar)}</span>${esc(p.name)} ▾`;
  const plan = activePlan(p.id), mine = sessionsOf(p.id), prog = progressOf(p.id);
  const lvlEnd = xpForLevel(prog.level + 1), lvlStart = xpForLevel(prog.level);
  const pct = Math.min(100, Math.round(100 * (prog.xp - lvlStart) / Math.max(1, lvlEnd - lvlStart)));
  const freeze = prog.freeze_month !== today.slice(0, 7);
  let h = `<div class="card lvl">
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
  h += challengeCard(p);
  h += headToHead(today);

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
        ${op.badges.length ? `<div>${op.badges.slice(-8).map(b => (BADGE[b] || {}).emoji || "").join(" ")}</div>` : ""}</div><span class="fam-go">Schedule &amp; log ›</span></button>${approvals(o)}`;
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
// Each day is collapsed to one line (name, core lift, minutes, Start); the next workout opens by default.
function renderPlan() {
  const p = profile(), plan = p && activePlan(p.id);
  if (!plan) { $("plan-body").innerHTML = `<div class="card"><h2>No plan yet</h2><button class="btn" data-act="tab" data-tab="profile">Enter my specs</button></div>`; return; }
  const teen = isTeen(p), up = nextDay(plan, sessionsOf(p.id));
  let h = `<div><h2 style="font-family:var(--title);margin:0">${esc(plan.name)}</h2><p class="muted small" style="margin:2px 0 0">${esc(plan.description)}</p></div>
    <div class="sched">${WEEK.map(w => { const s = plan.schedule.find(x => x.weekday === w), fixed = plan.days.find(d => d.suggested_weekday === w);
      return `<div class="${s ? (s.kind === "speed" ? "ath" : "lift") : ""}"><b>${w}</b>${s ? (fixed ? esc(fixed.name.replace(" Day", "")) : "Lift") : "Rest"}</div>`; }).join("")}</div>`;
  if (!plan.days.some(d => d.kind === "strength" && d.suggested_weekday)) h += `<p class="muted small" style="margin:-4px 0 0">Lifting days rotate Squat → Bench → Clean → Deadlift. Home always shows the next one.</p>`;
  h += `<details class="rules"><summary>${teen ? "🛡️" : "📈"} How this plan works</summary><ul>${plan.rules.map(r => `<li>${esc(r)}</li>`).join("")}<li>Back-to-back accessories are done as supersets (A1/A2): one set of each, then rest. Turn it off in a workout with ⋯.</li></ul></details>`;
  plan.days.forEach((d, n) => {
    const PR = pairsOf(d.items), core = d.items.find(i => corePattern(i.exercise_id));
    h += `<details class="card day c-${d.day_id}" ${d.day_id === up.day_id ? "open" : ""}><summary><div class="grow"><div class="row"><span class="pill">${d.suggested_weekday || "Day " + (n + 1)}</span>${d.day_id === up.day_id ? `<span class="pill">Next up</span>` : ""}</div>
      <h2 style="margin-top:6px">${esc(d.name)}</h2><p class="muted small" style="margin:0">${core ? esc(EX[core.exercise_id].name) + " · " : ""}${d.items.length} exercises · ~${d.est_minutes} min</p></div>
      <button class="btn sm${teen ? " teen" : ""}" data-act="start" data-day="${d.day_id}">Start</button></summary>
      <p class="muted small" style="margin:6px 0 0">${esc(d.focus)}</p><div style="margin-top:4px">` +
      d.items.map((i, k) => { const ex = EX[i.exercise_id];
        return `<div class="ex"><div class="ex-top"><span><span class="n">${i.order}.</span>${PR[k] ? `<i class="ss">${PR[k].tag}</i>` : ""}${esc(ex.name)}</span><span class="dose">${doseText(i)}</span></div>
        <div class="ex-meta">${BLOCK[i.block]}${i.load_lb ? ` · start <b>${loadText(i.load_lb, ex)}</b>` : ""}${i.rest_sec ? " · rest " + fmtRest(i.rest_sec) : ""}${i.notes ? "<br>" + esc(i.notes) : ""}</div>
        ${howBlock(ex, false, "cues how")}
        <details class="cues"><summary>Form cues</summary><ul>${cuesList(ex)}</ul></details></div>`; }).join("") + `</div></details>`;
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
const shortDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Line chart with labelled axes. pts = [{ d: "2026-11-03", v: 225 }], oldest first. "Better" is always up.
function lineChart(pts, o = {}) {
  const fmt = o.fmt || (v => v);
  if (pts.length < 2) return `<p class="muted small" style="margin:0">${pts.length ? `One entry so far (<b>${esc(fmt(pts[0].v))}</b>). The chart shows up after the next one.` : "Nothing logged yet."}</p>`;
  const Wd = 320, H = 150, L = 40, R = 12, T = 12, B = 22, vs = pts.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs); if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const t0 = dayNum(pts[0].d), span = dayNum(pts[pts.length - 1].d) - t0;
  const x = (p, i) => L + (span ? (dayNum(p.d) - t0) / span : i / (pts.length - 1)) * (Wd - L - R);
  const y = v => T + (o.lowerBetter ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * (H - T - B);
  const bestV = o.lowerBetter ? Math.min(...vs) : Math.max(...vs);
  const grid = [0, 0.5, 1].map(f => { const v = o.lowerBetter ? lo + f * (hi - lo) : hi - f * (hi - lo), yy = T + f * (H - T - B);
    return `<line class="grid" x1="${L}" x2="${Wd - R}" y1="${yy}" y2="${yy}"/><text class="ax" x="${L - 6}" y="${yy + 4}" text-anchor="end">${esc(fmt(+v.toFixed(o.dec || 0)))}</text>`; }).join("");
  const line = pts.map((p, i) => `${x(p, i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => `<circle class="${p.v === bestV ? "dot best" : "dot"}" cx="${x(p, i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p.v === bestV ? 4.5 : 3}"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${Wd} ${H}">${grid}<polyline class="spark" points="${line}"/>${dots}
    <text class="ax" x="${L}" y="${H - 5}">${shortDate(pts[0].d)}</text><text class="ax" x="${Wd - R}" y="${H - 5}" text-anchor="end">${shortDate(pts[pts.length - 1].d)}</text></svg>`;
}
function barChart(bars, fmt) {
  const Wd = 320, H = 130, T = 16, B = 20, max = Math.max(1, ...bars.map(b => b.v)), bw = (Wd - 8) / bars.length;
  return `<svg class="chart" viewBox="0 0 ${Wd} ${H}">${bars.map((b, i) => { const h = ((H - T - B) * b.v) / max, x = 4 + i * bw;
    return `<rect class="${b.now ? "vbar now" : "vbar"}" x="${(x + 4).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw - 8).toFixed(1)}" height="${Math.max(h, b.v ? 2 : 0).toFixed(1)}" rx="4"/>
      ${b.v ? `<text class="ax" x="${(x + bw / 2).toFixed(1)}" y="${(H - B - h - 4).toFixed(1)}" text-anchor="middle">${esc(fmt(b.v))}</text>` : ""}
      <text class="ax" x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(b.l)}</text>`; }).join("")}</svg>`;
}
const TEEN_CORE_IDS = ["goblet_squat", "trap_bar_deadlift", "db_bench_press", "hang_clean_pull", "hang_power_clean"];
const liftSets = (sets, l) => sets.filter(s => EX[s.exercise_id] && EX[s.exercise_id].core_lift === l && EX[s.exercise_id].measure === "lb" && s.weight > 0 && (EX[s.exercise_id].is_core_lift || TEEN_CORE_IDS.includes(s.exercise_id)));
let PG = { lift: null, drill: null };
ACTIONS["pg-lift"] = el => { PG.lift = el.dataset.v; renderProgress(); };
ACTIONS["pg-drill"] = el => { PG.drill = el.dataset.v; renderProgress(); };
function renderProgress() {
  const p = profile(); if (!p) return;
  const teen = isTeen(p), sets = setsOf(p.id), prog = progressOf(p.id);
  let h = `<div class="card"><h3>${teen ? "Best sets" : "Core lifts · best set & est. 1RM"}</h3><div class="lifts">`;
  const have = [];
  CORE_LIFTS.forEach(l => {
    const xs = liftSets(sets, l);
    const top = xs.slice().sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0];
    if (top) have.push(l);
    h += `<div class="lift-tile"><small>${LIFT_NAME[l]}</small>${top ? `<b>${top.weight} × ${top.reps}</b><span>${esc(EX[top.exercise_id].name)}${!teen && prog.best[l] ? " · e1RM " + prog.best[l] : ""}</span>` : `<span>No sets yet</span>`}</div>`;
  });
  h += `</div></div>`;

  // strength trend
  if (have.length) {
    const l = have.includes(PG.lift) ? PG.lift : have[0], xs = liftSets(sets, l), by = {};
    // adult: estimated 1RM of the best set each day; teen: heaviest clean working set (no max language)
    xs.forEach(s => { const v = teen ? s.weight : e1rm(s.weight, s.reps); if (!by[s.date] || v > by[s.date]) by[s.date] = v; });
    const pts = Object.keys(by).sort().map(d => ({ d, v: by[d] })), delta = pts.length > 1 ? pts[pts.length - 1].v - pts[0].v : 0;
    h += `<div class="card"><h3>${teen ? "Top set weight" : "Est. 1RM trend"}</h3><div class="quick">${have.map(x => `<button data-act="pg-lift" data-v="${x}" class="${x === l ? "on" : ""}">${LIFT_NAME[x]}</button>`).join("")}</div>
      ${lineChart(pts, { fmt: v => v + "" })}${pts.length > 1 ? `<p class="small" style="margin:6px 0 0"><b>${delta >= 0 ? "+" : ""}${delta} lb</b> <span class="muted">since ${shortDate(pts[0].d)}</span></p>` : ""}</div>`;
  }

  // speed & jumps
  const ms = metricsOf(p.id), drills = [...new Set(ms.map(m => m.drill))];
  h += `<div class="card"><h3>Speed, agility & jumps</h3>`;
  if (!drills.length) h += `<p class="muted small" style="margin:0">Type a time or distance on sprint, agility and jump drills and they'll chart here.</p>`;
  else {
    const d = drills.includes(PG.drill) ? PG.drill : drills[0], xs = ms.filter(m => m.drill === d), sec = xs[0].unit === "sec", u = sec ? "s" : '"', by = {};
    xs.forEach(m => { if (by[m.date] == null || (sec ? m.value < by[m.date] : m.value > by[m.date])) by[m.date] = m.value; });
    const pts = Object.keys(by).sort().map(dd => ({ d: dd, v: by[dd] })), vals = pts.map(x => x.v), best = sec ? Math.min(...vals) : Math.max(...vals), first = vals[0];
    const pct = first && best !== first ? Math.abs(((sec ? first - best : best - first) / first) * 100).toFixed(1) : 0;
    h += `<div class="quick">${drills.map(x => `<button data-act="pg-drill" data-v="${esc(x)}" class="${x === d ? "on" : ""}">${esc(x)}</button>`).join("")}</div>
      ${lineChart(pts, { lowerBetter: sec, dec: sec ? 2 : 0, fmt: v => v + u })}
      <div class="row small" style="margin-top:6px"><span>Best <b>${best}${u}</b></span><span class="muted">first ${first}${u}</span>${+pct ? `<span class="good-t"><b>${pct}% better</b></span>` : ""}</div>`;
  }
  h += `</div>`;

  // weekly work, last 8 weeks
  const wk0 = mondayOf(todayISO()), weeks = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(wk0 + "T12:00:00"); d.setDate(d.getDate() - 7 * i); weeks.push(d.toISOString().slice(0, 10)); }
  const bars = weeks.map((w, i) => {
    const end = weeks[i + 1] || "9999", xs = sets.filter(s => s.date >= w && s.date < end && EX[s.exercise_id]);
    const v = teen ? xs.filter(s => EX[s.exercise_id].measure === "lb" || EX[s.exercise_id].measure === "bw").length
      : xs.filter(s => EX[s.exercise_id].measure === "lb").reduce((t, s) => t + (s.weight || 0) * (s.reps || 0) * (EX[s.exercise_id].per_hand ? 2 : 1), 0);
    return { v, l: shortDate(w).replace(/ /, " "), now: i === weeks.length - 1 };
  });
  h += `<div class="card"><h3>${teen ? "Sets per week" : "Pounds moved per week"}</h3>${bars.some(b => b.v) ? barChart(bars, v => (teen ? v : v >= 1000 ? Math.round(v / 1000) + "k" : v)) : `<p class="muted small" style="margin:0">Log a workout and your weekly work shows up here.</p>`}</div>`;
  h += `<button class="btn ghost" data-act="tab" data-tab="history">See every workout in History ›</button>`;
  $("progress-body").innerHTML = h;
}

// ---------------- HISTORY ----------------
let HM = 0; // months back from this one
ACTIONS["h-mo"] = el => { HM = Math.min(0, HM + +el.dataset.d); renderHistory(); };
function renderHistory() {
  const p = profile(); if (!p) return;
  const sess = sessionsOf(p.id), today = todayISO();
  const base = new Date(today.slice(0, 8) + "01T12:00:00"); base.setMonth(base.getMonth() + HM);
  const ym = base.toISOString().slice(0, 7), lead = (base.getDay() + 6) % 7, days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const by = {}; sess.forEach(s => (by[s.date] = by[s.date] || []).push(s));
  const inMonth = sess.filter(s => s.date.slice(0, 7) === ym);
  let cal = WEEK.map(w => `<i>${w[0]}</i>`).join("") + "<span></span>".repeat(lead);
  for (let d = 1; d <= days; d++) {
    const iso = `${ym}-${String(d).padStart(2, "0")}`, s = (by[iso] || [])[0];
    cal += s ? `<button class="cal-d on c-${s.day_id}${iso === today ? " today" : ""}" data-act="h-open" data-id="${s.id}">${d}</button>` : `<span class="cal-d${iso === today ? " today" : ""}${iso > today ? " future" : ""}">${d}</span>`;
  }
  let h = `<div class="card"><div class="row between"><button class="icon" data-act="h-mo" data-d="-1" aria-label="Previous month">‹</button>
    <div class="center"><b>${base.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b><div class="muted small">${inMonth.length} workout${inMonth.length === 1 ? "" : "s"}</div></div>
    <button class="icon" data-act="h-mo" data-d="1" ${HM >= 0 ? "disabled" : ""} aria-label="Next month">›</button></div><div class="cal">${cal}</div></div>`;
  if (!sess.length) h += `<div class="card"><p class="muted" style="margin:0">No workouts yet. Finished workouts show up here — tap one to see every set or fix a number.</p></div>`;
  let lastMo = "";
  sess.forEach(s => {
    const mo = s.date.slice(0, 7);
    if (mo !== lastMo) { if (lastMo) h += `</div>`; lastMo = mo; h += `<div class="card"><h3>${new Date(mo + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>`; }
    h += `<button class="sess hrow" data-act="h-open" data-id="${s.id}"><div class="row between"><b><i class="dotc c-${s.day_id}"></i>${esc(s.day_name)}</b><span class="muted small">${shortDate(s.date)} ›</span></div>
      <div class="muted small">${s.duration_min || 0} min · +${s.xp || 0} XP${(s.prs || []).length ? " · 🏆 " + s.prs.length + " PR" : ""}${s.readiness && s.readiness.light ? " · lighter day" : ""}</div></button>`;
  });
  if (lastMo) h += `</div>`;
  $("history-body").innerHTML = h;
}
const sessionSets = id => rows("Sets").filter(x => x.session_id === id).sort((a, b) => a.set_number - b.set_number);
ACTIONS["h-open"] = el => sessionModal(el.dataset.id, false);
ACTIONS["h-edit"] = el => sessionModal(el.dataset.id, true);
function sessionModal(id, edit) {
  const s = DB.Sessions[id]; if (!s) return;
  const p = DB.Profiles[s.profile_id], sets = sessionSets(id), order = [];
  sets.forEach(x => { if (!order.includes(x.exercise_id)) order.push(x.exercise_id); });
  const tb = isTeen(p) ? " teen" : "";
  const exHtml = order.map(eid => {
    const ex = EX[eid] || { name: eid, measure: "bw" }, xs = sets.filter(x => x.exercise_id === eid), hold = HOLD_IDS.includes(eid);
    if (!edit) return `<div class="hx"><b>${esc(ex.name)}</b><div class="pills">${xs.map(x => `<span class="pill${x.is_pr ? " pr" : ""}">${x.is_pr ? "🏆 " : ""}${fmtSet(x, ex, hold)}${x.form ? ` · f${x.form}` : ""}</span>`).join("")}</div></div>`;
    return `<div class="hx"><b>${esc(ex.name)}</b>${xs.map(x => `<div class="hset"><span class="muted small">Set ${x.set_number}</span>${
      ex.measure === "sec" || ex.measure === "in" ? `<input id="h-${x.id}-x" inputmode="decimal" value="${x.result || ""}" placeholder="${ex.measure === "sec" ? "sec" : "in"}">`
      : `${ex.measure === "lb" ? `<input id="h-${x.id}-w" inputmode="decimal" value="${x.weight}"><span class="muted">×</span>` : ""}<input id="h-${x.id}-r" inputmode="numeric" value="${x.reps}"><span class="muted small">${hold ? "sec" : "reps"}</span>`}</div>`).join("")}</div>`;
  }).join("");
  const r = s.readiness && s.readiness.score != null ? `<span class="pill">Check-in ${s.readiness.score}/6${s.readiness.light ? " · lighter" : ""}</span>` : "";
  openModal(`<h2>${esc(s.day_name)}</h2><div class="pills"><span class="pill">${new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><span class="pill">${s.duration_min || 0} min</span><span class="pill">+${s.xp || 0} XP</span>${r}</div>
    ${(s.prs || []).length ? `<div class="card" style="background:var(--good-soft)">${s.prs.map(x => `<div>🏆 ${esc(x)}</div>`).join("")}</div>` : ""}
    ${exHtml || `<p class="muted">No sets logged.</p>`}
    ${edit ? `<div class="field"><label>Notes</label><textarea id="h-notes">${esc(s.notes)}</textarea></div>${isTeen(p) ? `<div class="field"><label>👨 Parent notes</label><textarea id="h-parent">${esc(s.parent_notes)}</textarea></div>` : ""}
      <p class="muted small" style="margin:0">Fixing a typo updates the numbers and charts. XP and badges already earned stay as they are.</p>
      <button class="btn big${tb}" data-act="h-save" data-id="${id}">Save changes</button><button class="btn ghost" data-act="h-open" data-id="${id}">Cancel</button>`
    : `${s.notes ? `<div class="small">📝 ${esc(s.notes)}</div>` : ""}${s.parent_notes ? `<div class="pn small">👨 ${esc(s.parent_notes)}</div>` : ""}
      ${s.recap ? `<details class="cues-box"><summary>🧢 Coach's write-up</summary><p class="recap">${esc(s.recap)}</p></details>` : ""}
      <button class="btn ghost" data-act="h-edit" data-id="${id}">✏️ Fix a number or note</button>`}`);
}
ACTIONS["h-save"] = el => {
  const id = el.dataset.id, s = DB.Sessions[id], changed = [];
  sessionSets(id).forEach(x => {
    const n = k => { const i = $(`h-${x.id}-${k}`); return i ? +i.value : null; }, y = Object.assign({}, x);
    if (n("w") != null) y.weight = Math.max(0, n("w") || 0);
    if (n("r") != null) y.reps = Math.max(0, Math.round(n("r") || 0));
    if (n("x") != null) y.result = n("x") > 0 ? n("x") : undefined;
    if (y.weight !== x.weight || y.reps !== x.reps || y.result !== x.result) { delete y.updated; changed.push(y); }
  });
  if (changed.length) {
    put("Sets", changed);
    // keep the drill results (Metrics) in step with fixed times/distances
    const fixed = changed.filter(x => EX[x.exercise_id] && EX[x.exercise_id].metric_name);
    [...new Set(fixed.map(x => x.exercise_id))].forEach(eid => {
      const ex = EX[eid], rs = sessionSets(id).filter(x => x.exercise_id === eid).map(x => +x.result).filter(v => v > 0);
      const m = rows("Metrics").find(m => m.profile_id === s.profile_id && m.date === s.date && m.drill === ex.metric_name);
      if (m && rs.length) put("Metrics", Object.assign({}, m, { value: ex.measure === "sec" ? Math.min(...rs) : Math.max(...rs) }));
    });
  }
  const notes = $("h-notes") ? $("h-notes").value : s.notes, parent = $("h-parent") ? $("h-parent").value : s.parent_notes;
  if (notes !== s.notes || parent !== s.parent_notes) put("Sessions", Object.assign({}, s, { notes, parent_notes: parent }));
  toast(changed.length || notes !== s.notes || parent !== s.parent_notes ? "Saved ✓" : "No changes");
  sessionModal(id, false); refresh();
};

// ---------------- MONTHLY CHALLENGES (💯 Max Effort for the teen) ----------------
// Built from each lifter's own numbers, fixed for the month (targets use only what was logged before it started).
// Teen challenges count once a parent gives the 👍; adults claim their own. Each one is worth +100 XP.
const CH_XP = 100;
const monthName = ym => new Date(ym + "-15T12:00:00").toLocaleDateString("en-US", { month: "long" });
function challengesFor(p, ym) {
  const start = ym + "-01", inMo = d => d && d.slice(0, 7) === ym;
  const sess = sessionsOf(p.id).filter(s => inMo(s.date)), sets = setsOf(p.id).filter(s => inMo(s.date));
  const ms = metricsOf(p.id), before = ms.filter(m => m.date < start), now = ms.filter(m => inMo(m.date));
  const out = [], n = Math.max(4, (+p.days_per_week || 3) * 4 - 2);
  out.push({ key: ym + ":sessions", emoji: "📅", text: `Train ${n} times in ${monthName(ym)}`, have: sess.length, need: n });
  const drills = [...new Set(before.map(m => m.drill))].sort();
  if (drills.length) {
    const d = drills[(+ym.slice(5) - 1) % drills.length], xs = before.filter(m => m.drill === d), sec = xs[0].unit === "sec", u = sec ? "s" : '"';
    const best = sec ? Math.min(...xs.map(m => m.value)) : Math.max(...xs.map(m => m.value));
    const target = sec ? Math.floor(best * 0.98 * 100) / 100 : Math.max(best + 1, Math.ceil(best * 1.03));
    const mine = now.filter(m => m.drill === d).map(m => m.value), mb = mine.length ? (sec ? Math.min(...mine) : Math.max(...mine)) : null;
    out.push({ key: ym + ":drill", emoji: sec ? "💨" : "🦘", text: sec ? `${d} in ${target}s or faster` : `${d} of ${target}" or more`,
      sub: `Best before this month ${best}${u}${mb != null ? ` · this month ${mb}${u}` : ""}`, have: mb != null && (sec ? mb <= target : mb >= target) ? 1 : 0, need: 1 });
  } else out.push({ key: ym + ":drills", emoji: "💨", text: "Log a time or distance on 3 different speed or jump drills", have: new Set(now.map(m => m.drill)).size, need: 3 });
  if (isTeen(p)) out.push({ key: ym + ":form", emoji: "🎯", text: "15 sets rated form 5 (Perfect)", have: sets.filter(s => s.form === 5).length, need: 15 });
  else out.push({ key: ym + ":prs", emoji: "🏆", text: "Set 3 personal bests", have: sets.filter(s => s.is_pr).length, need: 3 });
  const ok = progressOf(p.id).approved || [];
  return out.map(c => Object.assign(c, { done: c.have >= c.need, approved: ok.includes(c.key) }));
}
const parentViewing = () => { const me = DB.Profiles[ME]; return me && !isTeen(me); };
function challengeCard(p) {
  const ym = todayISO().slice(0, 7), cs = challengesFor(p, ym), teen = isTeen(p), tb = teen ? " teen" : "";
  const got = cs.filter(c => c.approved).length;
  return `<div class="card ch"><h3>${teen ? "💯 Max Effort" : "🎯 Monthly challenges"} · ${monthName(ym)} <span class="muted small" style="font-weight:600;text-transform:none;letter-spacing:0">${got}/${cs.length} · +${CH_XP} XP each</span></h3>${cs.map(c => {
    const pct = Math.min(100, Math.round((100 * c.have) / c.need));
    const act = c.approved ? `<span class="ch-ok">✓</span>`
      : !c.done ? `<span class="muted small">${c.need > 1 ? `${Math.min(c.have, c.need)}/${c.need}` : ""}</span>`
      : teen && !parentViewing() ? `<span class="ch-wait">Waiting for Dad's 👍</span>`
      : `<button class="btn sm${tb}" data-act="ch-ok" data-id="${p.id}" data-key="${c.key}">${teen ? "👍 Approve" : "Claim"}</button>`;
    return `<div class="ch-row${c.approved ? " got" : ""}"><span class="ch-e">${c.emoji}</span><div class="grow"><div>${esc(c.text)}</div>${c.sub ? `<div class="muted small">${esc(c.sub)}</div>` : ""}<div class="xpbar"><i style="width:${pct}%"></i></div></div>${act}</div>`;
  }).join("")}</div>`;
}
// Under a teen in Dad's Family card: finished challenges waiting for a 👍.
function approvals(o) {
  if (!isTeen(o) || !parentViewing()) return "";
  const ready = challengesFor(o, todayISO().slice(0, 7)).filter(c => c.done && !c.approved);
  return ready.map(c => `<div class="appr"><span>💯 ${esc(o.name)} finished: <b>${esc(c.text)}</b></span><button class="btn sm teen" data-act="ch-ok" data-id="${o.id}" data-key="${c.key}">👍 +${CH_XP}</button></div>`).join("");
}
ACTIONS["ch-ok"] = el => {
  const id = el.dataset.id, key = el.dataset.key, p = DB.Profiles[id], pr = progressOf(id);
  if ((pr.approved || []).includes(key)) return;
  const approved = (pr.approved || []).concat([key]), xp = (pr.xp || 0) + CH_XP, badges = (pr.badges || []).slice();
  const all = challengesFor(p, key.slice(0, 7)).every(c => approved.includes(c.key));
  if (all && !badges.includes("challenge_month")) badges.push("challenge_month");
  put("Progress", Object.assign({}, pr, { approved, xp, level: levelFor(xp), badges }));
  chime("win"); confetti(all ? 120 : 50);
  toast(all ? `🏅 Month conquered! +${CH_XP} XP` : isTeen(p) ? `👍 Approved — +${CH_XP} XP for ${p.name}` : `+${CH_XP} XP`, 2400);
  refresh();
};

// ---------------- HEAD TO HEAD (this week) ----------------
// Fair across a 13-year-old and his dad: workouts vs. each person's own weekly goal, % better than their
// own previous bests, and average form. Nobody's pounds are compared.
function weekStats(p, wk) {
  const sess = sessionsOf(p.id).filter(s => s.date >= wk), all = setsOf(p.id), now = all.filter(s => s.date >= wk), prior = all.filter(s => s.date < wk), pcts = [];
  [...new Set(now.map(s => s.exercise_id))].forEach(id => {
    if (!EX[id] || EX[id].measure !== "lb") return;
    const best = xs => Math.max(0, ...xs.filter(s => s.exercise_id === id && s.weight > 0).map(s => e1rm(s.weight, s.reps)));
    const b0 = best(prior), b1 = best(now); if (b0 > 0 && b1 > 0) pcts.push((b1 / b0 - 1) * 100);
  });
  const ms = metricsOf(p.id);
  [...new Set(ms.filter(m => m.date >= wk).map(m => m.drill))].forEach(d => {
    const a = ms.filter(m => m.drill === d && m.date < wk).map(m => m.value), b = ms.filter(m => m.drill === d && m.date >= wk).map(m => m.value);
    if (!a.length) return; const sec = ms.find(m => m.drill === d).unit === "sec";
    pcts.push(sec ? (Math.min(...a) / Math.min(...b) - 1) * 100 : (Math.max(...b) / Math.max(...a) - 1) * 100);
  });
  const rated = now.filter(s => s.form), goal = +p.days_per_week || 3;
  return { n: sess.length, goal, done: Math.min(1, sess.length / goal), pct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null, form: rated.length ? rated.reduce((a, s) => a + s.form, 0) / rated.length : null };
}
function headToHead(today) {
  const ps = profiles(); if (ps.length < 2) return "";
  const wk = mondayOf(today), st = ps.map(p => ({ p, s: weekStats(p, wk) })), wins = new Map(ps.map(p => [p.id, 0]));
  const lead = f => { const vs = st.map(x => f(x.s)).filter(v => v != null); if (!vs.length) return null; const m = Math.max(...vs); const who = st.filter(x => f(x.s) === m); if (who.length === 1 && m > 0) wins.set(who[0].p.id, wins.get(who[0].p.id) + 1); return m; };
  const rowsDef = [["Workouts", s => s.done, s => `${s.n}/${s.goal}`], ["Got better", s => s.pct, s => (s.pct == null ? "—" : `${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(1)}%`)], ["Avg form", s => s.form, s => (s.form == null ? "—" : s.form.toFixed(1))]];
  const tops = rowsDef.map(([, f]) => lead(f)), max = Math.max(...wins.values()), champs = [...wins].filter(([, v]) => v === max && v > 0);
  return `<div class="card h2h"><h3>⚔️ This week</h3><div class="h2h-g" style="grid-template-columns:86px repeat(${ps.length},1fr)"><span></span>${st.map(x => `<b class="center">${esc(x.p.avatar)} ${esc(x.p.name)}${champs.length === 1 && champs[0][0] === x.p.id ? " 👑" : ""}</b>`).join("")}
    ${rowsDef.map(([label, f, show], k) => `<span class="muted small">${label}</span>${st.map(x => `<span class="center${tops[k] != null && f(x.s) === tops[k] && f(x.s) > 0 ? " win" : ""}">${show(x.s)}</span>`).join("")}`).join("")}</div>
    <p class="muted small" style="margin:6px 0 0">Everyone vs. their own goals and their own bests — fair at any age.</p></div>`;
}

// ---------------- PROFILE / SPECS ----------------
const AVATARS = ["🏋️", "⚡", "🦍", "🐺", "🦅", "🔥", "🐻", "🚀", "🐶", "⚾"];
let FORM = null;
function renderProfile(arg = {}) {
  if (!arg.keep || !FORM) {
    const p = arg.fresh ? null : profile();
    if (p) FORM = JSON.parse(JSON.stringify(p));
    else {
      const t = arg.teen || profiles().some(x => x.type === "adult") ? "teen" : "adult";
      FORM = { fresh: true, step: 0, id: uid("p_"), name: "", type: t, age: "", bodyweight: "", experience: "beginner",
        lifts: { squat: {}, bench: {}, clean: {}, deadlift: {} }, days_per_week: t === "teen" ? 3 : 4, session_length: 60,
        goal: t === "teen" ? "sports" : "balanced", form_focus_mode: t === "teen", avatar: t === "teen" ? "⚡" : "🏋️" };
    }
  }
  const f = FORM, teen = f.type === "teen", first = f.fresh && !profiles().length;
  $("profile-title").textContent = f.fresh ? (first ? "Welcome" : teen ? "Add an athlete" : "New lifter") : coaching() ? f.name + "'s specs" : "My specs";
  const seg = (key, opts) => `<div class="seg" style="grid-template-columns:repeat(${opts.length},1fr)">${opts.map(([v, l]) => `<button data-act="seg" data-k="${key}" data-v="${v}" class="${String(f[key]) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const who = `<div class="card"><h3>Who</h3>
    ${seg("type", [["adult", "Adult"], ["teen", "Teen / Athlete"]])}
    <div class="field"><label>Name</label><input id="f-name" value="${esc(f.name)}" autocomplete="off" placeholder="${teen ? "Max" : "Sam"}"></div>
    <div class="grid2"><div class="field"><label>Age</label><input id="f-age" type="number" inputmode="numeric" value="${esc(f.age)}"></div>
    <div class="field"><label>Bodyweight (lb)</label><input id="f-bw" type="number" inputmode="decimal" value="${esc(f.bodyweight)}"></div></div>
    <div class="field"><label>Lifting experience</label>${seg("experience", [["beginner", "Beginner"], ["intermediate", "Intermediate"]])}</div>
    ${teen ? `<p class="muted small" style="margin:0">Beginner uses technique versions (goblet squat, DB bench, hang clean pulls, trap-bar). Switch to Intermediate once the barbell lifts look smooth.</p>` : ""}
    <div class="field"><label>Icon</label><div class="avs">${AVATARS.map(a => `<button data-act="avatar" data-v="${a}" class="${a === f.avatar ? "on" : ""}">${a}</button>`).join("")}</div></div>
  </div>`;
  const lifts = `<div class="card"><h3>${teen ? "Best recent sets (optional)" : "Best recent sets"}</h3>
    <p class="muted small" style="margin:0">${teen ? "Only if he's done the barbell lift lately with good form. Leave blank for safe starting weights." : "A recent hard set, like 225 × 5. Leave blank for bodyweight-based starting weights."}</p>
    ${CORE_LIFTS.map(l => `<div class="liftrow"><b>${LIFT_NAME[l]}</b><input id="f-${l}-w" type="number" inputmode="decimal" placeholder="lb" value="${esc((f.lifts[l] || {}).weight || "")}"><span class="muted">×</span><input id="f-${l}-r" type="number" inputmode="numeric" placeholder="reps" value="${esc((f.lifts[l] || {}).reps || "")}"></div>`).join("")}
  </div>`;
  const sched = `<div class="card"><h3>Schedule & goal</h3>
    <div class="field"><label>Days per week</label>${seg("days_per_week", [[2, "2"], [3, "3"], [4, "4"], [5, "5"]])}</div>
    <div class="field"><label>Session length</label>${seg("session_length", [[45, "45m"], [60, "60m"], [75, "75m"], [90, "90m"]])}</div>
    <div class="field"><label>Primary goal</label>${seg("goal", [["strength", "Strength"], ["sports", "Sports"], ["balanced", "Balanced"]])}</div>
    <button class="toggle${f.form_focus_mode ? " on" : ""}" data-act="ff"><span><b>Form-focus mode</b><br><span class="muted small">Rate form on every lift; cues open by default</span></span><i></i></button>
  </div>`;
  const tb = teen ? " teen" : "";
  if (f.fresh) {
    // New lifter: three short steps instead of one long scroll.
    const steps = [["About " + (f.name || (teen ? "him" : "you")), who], ["Starting numbers", lifts], ["Schedule", sched]], st = f.step || 0;
    $("profile-body").innerHTML = `
      ${first && st === 0 ? `<p class="muted" style="margin:0">Start with you — you'll add Max right after.</p>` : ""}
      <div class="dots${tb}">${steps.map((x, i) => `<i class="${i <= st ? "on" : ""}"></i>`).join("")}<span class="muted small">Step ${st + 1} of 3 · ${esc(steps[st][0])}</span></div>
      ${steps[st][1]}
      <p class="err" id="f-err" hidden></p>
      <div class="row nav2">${st ? `<button class="btn big ghost" data-act="f-back">Back</button>` : ""}
      ${st < 2 ? `<button class="btn big${tb}" data-act="f-next">Next</button>` : `<button class="btn big${tb}" data-act="save-profile">Build ${teen ? "his" : "my"} plan</button>`}</div>`;
    return;
  }
  const prog = progressOf(f.id);
  $("profile-body").innerHTML = `${who}${lifts}${sched}
  <p class="err" id="f-err" hidden></p>
  <button class="btn big${tb}" data-act="save-profile">Save & rebuild plan</button>
  <button class="btn ghost" data-act="save-profile" data-keep="1">Save without changing the plan</button>
  <div class="card"><h3>Lifetime</h3><div class="small">Level ${prog.level} · ${prog.xp} XP · longest streak ${prog.longest || 0} · ${sessionsOf(f.id).length} workouts</div></div>
  <div class="card"><h3>This phone</h3><div class="small">${SERVER ? (pin() ? "Connected to the Google Sheet." : "Not signed in.") : "Not connected to a Google Sheet — data stays on this phone."}${store.get("af:out", []).length ? " Some changes are waiting to sync." : ""}</div>
    <div class="pills" style="margin-top:8px"><button class="btn sm ghost" data-act="switch">Switch lifter</button><button class="btn sm ghost" data-act="new-profile">+ Add a lifter</button>${SERVER ? `<button class="btn sm ghost" data-act="sync-now">Sync now</button>` : ""}</div></div>`;
}
function readForm() {
  const v = id => ($(id) ? $(id).value.trim() : null);
  if (v("f-name") !== null) { FORM.name = v("f-name"); FORM.age = +v("f-age") || ""; FORM.bodyweight = +v("f-bw") || ""; }
  CORE_LIFTS.forEach(l => { if (v(`f-${l}-w`) === null) return; const w = +v(`f-${l}-w`) || 0; FORM.lifts[l] = { weight: w, reps: +v(`f-${l}-r`) || (w ? 5 : 0) }; });
}
function formError() {
  if (!FORM.name) return "Name is required.";
  if (!(FORM.age >= 8 && FORM.age <= 90)) return "Enter a valid age.";
  if (!(FORM.bodyweight >= 50)) return "Enter bodyweight in pounds.";
  return "";
}
ACTIONS["f-next"] = () => {
  readForm();
  const e = FORM.step === 0 && formError();
  if (e) { $("f-err").textContent = e; $("f-err").hidden = false; return; }
  FORM.step = (FORM.step || 0) + 1; renderProfile({ keep: true }); $("profile-body").scrollTop = 0;
};
ACTIONS["f-back"] = () => { readForm(); FORM.step = Math.max(0, (FORM.step || 0) - 1); renderProfile({ keep: true }); };
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
  const e = formError();
  if (e) { if (FORM.fresh) { FORM.step = 0; renderProfile({ keep: true }); } $("f-err").textContent = e; $("f-err").hidden = false; return; }
  const p = Object.assign({}, FORM); delete p.fresh; delete p.step;
  put("Profiles", p);
  const wasFresh = FORM.fresh, me = DB.Profiles[ME];
  if (!el.dataset.keep || wasFresh) savePlan(p);
  FORM = null;
  if (wasFresh && me && me.id !== p.id && isTeen(p) && !isTeen(me)) {
    // Dad added Max: stay signed in as Dad and open Max's new plan in coaching mode.
    coachAs(p.id); toast(`${p.name}'s plan is built 💪`); return show("plan");
  }
  if (wasFresh || !coaching()) { ME = p.id; store.set("af:me", ME); coachAs(null); }
  if (wasFresh && !isTeen(p) && !profiles().some(isTeen)) { toast("Plan built 💪 Now add Max"); return show("profile", { fresh: true, teen: true }); }
  toast(wasFresh ? "Plan built 💪" : "Saved");
  show(el.dataset.keep ? "home" : "plan");
};
