// workout.js: the in-gym screen. Big numbers, last time vs. today's target on every set, form rating,
// rest timer, screen kept awake. Progress is saved on the phone after every tap, so a refresh or a dead
// battery never loses a workout.

let W = null; // the workout in progress
const wKey = (pid, planId, dayId) => `af:w:${pid}:${planId}:${dayId}`;
const FORM_WORDS = ["", "Rough", "Shaky", "OK", "Solid", "Perfect"];

ACTIONS.start = el => {
  const p = profile(), plan = activePlan(p.id), day = plan.days.find(d => d.day_id === el.dataset.day);
  closeModal();
  const key = wKey(p.id, plan.id, day.day_id);
  W = store.get(key, null) || { key, pid: p.id, plan_id: plan.id, day_id: day.day_id, day_name: day.name, started: Date.now(),
    items: JSON.parse(JSON.stringify(day.items)), logged: {}, done: {}, idx: 0, notes: "", parent: "", coach: [] };
  W.cur = null;
  $("w-finish").hidden = false; document.querySelector(".coachbtn").hidden = false;
  show("workout");
  wakeLock();
};
const saveW = () => { const c = W.cur; delete W.cur; store.set(W.key, W); W.cur = c; };

let lock = null;
function wakeLock() { try { navigator.wakeLock && navigator.wakeLock.request("screen").then(l => (lock = l)).catch(() => {}); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && active === "workout") wakeLock(); });

function cur() {
  const p = profile(), it = W.items[W.idx], ex = EX[it.exercise_id];
  const hist = setsOf(p.id).filter(s => s.exercise_id === it.exercise_id);
  let sug = suggest(p, it, ex, hist);
  if (it.load_override != null) sug = Object.assign({}, sug, { weight: it.load_override, kind: "hold", reason: "Coach adjusted today's weight." });
  const prevSess = historySessions(hist)[0] || null;
  const logged = W.logged[W.idx] || [];
  const simple = it.block === "warmup" || it.block === "mobility";
  const loaded = ex.measure === "lb", metric = ex.measure === "sec" || ex.measure === "in";
  const holdIt = !!it.time_sec && !simple, single = !loaded && !holdIt && it.rep_max === 1;
  const formApplies = !simple && !metric && ["strength", "power", "accessory"].includes(it.block);
  const formReq = formApplies && isTeen(p) && (p.form_focus_mode || it.progression === "double");
  const step = ex.per_hand ? 5 : isTeen(p) && !ex.lower_body ? 2.5 : 5;
  return { p, it, ex, sug, prevSess, logged, simple, loaded, metric, holdIt, single, formApplies, formReq, step, setNo: logged.length };
}

function renderWorkout() {
  if (!W) return show("home");
  const c = cur(), teen = isTeen(c.p);
  if (!W.cur || W.cur.idx !== W.idx || W.cur.setNo !== c.setNo) {
    const last = c.logged[c.logged.length - 1];
    W.cur = { idx: W.idx, setNo: c.setNo, weight: last ? last.weight : c.sug.weight || 0,
      reps: c.holdIt ? c.it.time_sec : c.sug.reps[c.setNo] || (last && last.reps) || c.it.rep_min, form: 0, rpe: 0, result: "" };
  }
  const doneN = W.items.filter((_, i) => W.done[i]).length;
  $("w-title").textContent = `${profile().avatar} ${W.day_name}`;
  $("w-sub").textContent = `${Math.floor((Date.now() - W.started) / 60000)} min · ${doneN}/${W.items.length} done`;
  $("w-finish").className = "btn sm" + (doneN === W.items.length ? " good" : " ghost");
  $("w-chips").innerHTML = W.items.map((it, i) => `<button data-act="w-go" data-i="${i}" class="${i === W.idx ? "on" : ""} ${W.done[i] ? "done" : ""} ${it.coached ? "coached" : ""}">${W.done[i] ? "✓ " : ""}${esc(EX[it.exercise_id].name)}</button>`).join("");
  const onChip = $("w-chips").children[W.idx]; if (onChip) onChip.scrollIntoView({ inline: "center", block: "nearest" });

  const { it, ex, sug, prevSess, logged } = c;
  let h = `<div><div class="w-kicker">${W.idx + 1} / ${W.items.length} · ${BLOCK[it.block]}${it.distance ? " · " + esc(it.distance) : ""}</div>
    <div class="w-name">${esc(ex.name)}</div>
    <div class="w-dose">${doseText(it)}${it.rest_sec ? `<small>rest ${fmtRest(it.rest_sec)}</small>` : ""}</div>
    ${it.notes ? `<p class="muted small" style="margin:6px 0 0">${esc(it.notes)}</p>` : ""}</div>`;
  if (it.coached) h += `<div class="coachnote">🧢 ${esc(it.coached)}</div>`;
  h += `<details class="cues-box" ${c.p.form_focus_mode || c.simple ? "open" : ""}><summary>Form cues</summary><ul>${(ex.form_cues || "").split("|").map(x => `<li>${esc(x.trim())}</li>`).join("")}</ul></details>`;

  if (c.simple) {
    h += `<button class="btn huge${W.done[W.idx] ? " ghost" : teen ? " teen" : ""}" data-act="w-done">${W.done[W.idx] ? "✓ Done" : "Mark done"}</button>`;
  } else {
    if (c.loaded || prevSess) {
      const w = c.loaded && sug.weight ? `${sug.weight} lb${ex.per_hand ? " each" : ""} × ` : "";
      h += `<div class="sugg ${sug.kind}"><b>Today: ${w}${c.holdIt ? it.time_sec + "s" : sug.reps.join(" / ")}</b>${sug.kind === "increase" ? " ⬆️" : ""}<p>${esc(sug.reason)}</p></div>`;
    }
    h += `<div class="sets">` + Array.from({ length: Math.max(it.sets, logged.length) }, (_, i) => {
      const l = logged[i], pv = prevSess && prevSess[i];
      const goal = c.single || c.metric ? (it.distance || "") : `Goal ${c.loaded && sug.weight ? sug.weight + "×" : ""}${c.holdIt ? it.time_sec + "s" : sug.reps[i] || it.rep_min}`;
      return `<div class="set ${i === c.setNo && !W.done[W.idx] ? "on" : ""}"><span class="k">Set ${i + 1}</span><span class="p">${pv ? "Last " + fmtSet(pv, ex, c.holdIt) : "Last —"}</span><span>${l ? `<b>${fmtSet(l, ex, c.holdIt)}</b>${l.form ? ` <span class="muted small">f${l.form}</span>` : ""}` : `<span class="muted">${goal}</span>`}</span><span class="ok">${l ? "✓" : ""}</span></div>`;
    }).join("") + `</div>`;

    if (!W.done[W.idx]) {
      const u = W.cur;
      h += `<div class="entry">`;
      if (c.loaded) h += `<div class="step"><button data-act="w-step" data-k="weight" data-d="-${c.step}">−</button><input id="w-weight" inputmode="decimal" value="${u.weight}"><button data-act="w-step" data-k="weight" data-d="${c.step}">+</button></div><div class="step-l">${ex.per_hand ? "lb each hand" : "lb"}</div>`;
      if (!c.metric && !c.single) h += `<div class="step"><button data-act="w-step" data-k="reps" data-d="${c.holdIt ? -5 : -1}">−</button><input id="w-reps" inputmode="numeric" value="${u.reps}"><button data-act="w-step" data-k="reps" data-d="${c.holdIt ? 5 : 1}">+</button></div><div class="step-l">${c.holdIt ? "seconds" : "reps"}</div>`;
      if (c.metric) h += `<div class="flabel">Best ${ex.measure === "sec" ? "time (seconds)" : "distance (inches)"} — optional</div><input id="w-result" class="result" inputmode="decimal" placeholder="${ex.measure === "sec" ? "1.92" : "84"}" value="${esc(u.result)}">`;
      if (c.formApplies) h += `<div class="flabel ${c.formReq ? "req" : ""}">Form quality ${c.formReq ? "(required)" : "(optional)"}</div>
        <div class="formq">${[1, 2, 3, 4, 5].map(f => `<button data-act="w-form" data-v="${f}" class="f${f} ${u.form === f ? "on" : ""}">${f}<small>${FORM_WORDS[f]}</small></button>`).join("")}</div>`;
      if (!teen && c.loaded) h += `<div class="rpe"><span>RPE</span>${[6, 7, 8, 9, 10].map(v => `<button data-act="w-rpe" data-v="${v}" class="${u.rpe === v ? "on" : ""}">${v}</button>`).join("")}</div>`;
      const blocked = c.formReq && !u.form;
      h += `<button class="btn huge${teen ? " teen" : ""}" data-act="w-log" ${blocked ? "disabled" : ""}>${blocked ? "Rate your form to log" : c.single || c.metric ? `Done — rep ${c.setNo + 1} of ${it.sets}` : `Log set ${c.setNo + 1}`}</button></div>`;
    }
    h += `<div class="row between"><button class="btn sm ghost" data-act="w-undo" ${logged.length ? "" : "disabled"}>↶ Undo last</button>${!W.done[W.idx] ? `<button class="btn sm ghost" data-act="w-done">${logged.length ? "Skip remaining sets" : "Skip exercise"}</button>` : ""}</div>`;
  }
  h += `<div class="wnav"><button class="btn line" data-act="w-go" data-i="${W.idx - 1}" ${W.idx === 0 ? "disabled" : ""}>‹ Prev</button><button class="btn line" data-act="w-go" data-i="${W.idx + 1}" ${W.idx === W.items.length - 1 ? "disabled" : ""}>Next ›</button></div>`;

  const allDone = W.items.every((_, i) => W.done[i]);
  if (allDone || teen) {
    h += `<div class="${allDone ? "finish-box" : "card"}">${allDone ? `<b style="font-size:18px">All done 💪</b>` : ""}
      ${teen ? `<div class="field"><label>👨 Parent notes</label><textarea id="w-parent" placeholder="Form, how he looked, anything to watch next time…">${esc(W.parent)}</textarea></div>` : ""}
      ${allDone ? `<div class="field"><label>Session notes</label><textarea id="w-notes" placeholder="How did it feel?">${esc(W.notes)}</textarea></div>
      <button class="btn huge good" data-act="finish">Finish & save</button>` : ""}</div>`;
  }
  $("w-body").innerHTML = h;
  ["w-parent", "w-notes"].forEach(id => { const t = $(id); if (t) t.addEventListener("input", () => { W[id === "w-parent" ? "parent" : "notes"] = t.value; saveW(); }); });
  ["weight", "reps", "result"].forEach(k => { const i = $("w-" + k); if (i) { i.addEventListener("focus", () => i.select()); i.addEventListener("input", () => (W.cur[k] = k === "result" ? i.value : +i.value || 0)); } });
}
function fmtSet(x, ex, holdIt) {
  if (ex.measure === "sec") return x.result ? x.result + "s" : "✓";
  if (ex.measure === "in") return x.result ? x.result + '"' : "✓";
  if (holdIt) return x.reps + "s";
  if (ex.measure === "bw") return x.reps === 1 ? "✓" : x.reps + " reps";
  return `${x.weight}×${x.reps}`;
}

ACTIONS["w-go"] = el => { const i = +el.dataset.i; if (i >= 0 && i < W.items.length) { W.idx = i; saveW(); renderWorkout(); $("w-body").scrollTop = 0; } };
ACTIONS["w-step"] = el => { const k = el.dataset.k; W.cur[k] = Math.max(0, +(W.cur[k] + +el.dataset.d).toFixed(2)); $("w-" + k).value = W.cur[k]; buzz(8); };
ACTIONS["w-form"] = el => { const v = +el.dataset.v; W.cur.form = W.cur.form === v ? 0 : v; renderWorkout(); };
ACTIONS["w-rpe"] = el => { const v = +el.dataset.v; W.cur.rpe = W.cur.rpe === v ? 0 : v; renderWorkout(); };
function nextUndone(from) { for (let k = 1; k <= W.items.length; k++) { const j = (from + k) % W.items.length; if (!W.done[j]) return j; } return from; }
ACTIONS["w-log"] = () => {
  const c = cur(), u = W.cur, r = +u.result;
  const set = { exercise_id: c.it.exercise_id, set_number: c.setNo + 1, weight: c.loaded ? u.weight : 0, reps: c.single || c.metric ? 1 : u.reps,
    form: c.formApplies && u.form ? u.form : undefined, rpe: !isTeen(c.p) && c.loaded && u.rpe ? u.rpe : undefined, result: c.metric && r > 0 ? r : undefined };
  const list = (W.logged[W.idx] = (W.logged[W.idx] || []).concat([set]));
  buzz(15);
  const rest = c.it.rest_sec;
  if (list.length >= c.it.sets) { W.done[W.idx] = true; W.idx = nextUndone(W.idx); }
  saveW(); renderWorkout();
  if (rest) startRest(rest);
};
ACTIONS["w-done"] = () => { W.done[W.idx] = true; W.idx = nextUndone(W.idx); saveW(); renderWorkout(); };
ACTIONS["w-undo"] = () => { const l = W.logged[W.idx] || []; l.pop(); W.done[W.idx] = false; saveW(); renderWorkout(); };
ACTIONS["leave-workout"] = () => { stopRest(); show("home"); toast("Workout saved — resume anytime"); };

// ---------- rest timer ----------
let restEnd = 0, restTotal = 0, restT = null, rang = false;
function startRest(sec) {
  restTotal = sec; restEnd = Date.now() + sec * 1000; rang = false;
  $("rest").hidden = false; tickRest(); clearInterval(restT); restT = setInterval(tickRest, 250);
}
function tickRest() {
  const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
  $("rest-n").textContent = left ? fmtClock(left) : "GO";
  $("rest").classList.toggle("go", !left);
  $("rest-fill").style.width = (restTotal ? (100 * left) / restTotal : 0) + "%";
  $("rest-skip").textContent = left ? "Skip" : "Close";
  if (!left && !rang) { rang = true; chime("go"); buzz([200, 100, 200]); }
  if (active === "workout" && W) $("w-sub").textContent = `${Math.floor((Date.now() - W.started) / 60000)} min · ${W.items.filter((_, i) => W.done[i]).length}/${W.items.length} done`;
}
const fmtClock = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
function stopRest() { clearInterval(restT); $("rest").hidden = true; }
ACTIONS["rest-add"] = () => { restEnd += 15000; restTotal += 15; tickRest(); };
ACTIONS["rest-skip"] = () => stopRest();

// ---------- finish ----------
ACTIONS.finish = () => {
  const all = Object.keys(W.logged).flatMap(i => W.logged[i]);
  if (!all.length && !confirm("No sets logged yet. Finish anyway?")) return;
  stopRest();
  const p = profile(), date = todayISO(), sid = uid("s_");
  const sets = all.map(s => Object.assign({ id: uid("x_"), session_id: sid, profile_id: p.id, date, is_pr: false }, s));
  const mine = sessionsOf(p.id);
  const res = scoreWorkout({ profile: p, progress: progressOf(p.id), date, day_id: W.day_id, sets, history: setsOf(p.id), metricsHistory: metricsOf(p.id),
    sessionsMine: mine, familyToday: rows("Sessions").some(s => s.profile_id !== p.id && s.date === date),
    allDone: W.items.every((it, i) => W.done[i] && (it.block === "warmup" || it.block === "mobility" || (W.logged[i] || []).length >= it.sets)) });
  const session = { id: sid, profile_id: p.id, date, plan_id: W.plan_id, day_id: W.day_id, day_name: W.day_name,
    duration_min: Math.max(1, Math.round((Date.now() - W.started) / 60000)), xp: res.xp, prs: res.prs, notes: W.notes,
    parent_notes: isTeen(p) ? W.parent : "", recap: "", coach_changes: W.coach.length ? W.coach : "" };
  put("Sets", sets);
  put("Metrics", res.metrics.map(m => Object.assign({ id: uid("m_"), profile_id: p.id, date }, m)));
  put("Sessions", session);
  put("Progress", Object.assign(res.progress, { id: p.id }));
  store.del(W.key);
  const finished = W; W = null;
  showSummary(p, session, res, sets, finished);
};

function showSummary(p, session, res, sets, w) {
  const teen = isTeen(p);
  $("w-chips").innerHTML = ""; $("w-sub").textContent = "Saved";
  $("w-finish").hidden = true; document.querySelector(".coachbtn").hidden = true;
  $("w-body").innerHTML = `<div class="summary body" style="padding:0">
    <div style="font-size:60px" class="pop">${res.prs.length ? "🏆" : "🔥"}</div>
    <h2 style="font-family:var(--title);font-size:32px;margin:0">Workout saved</h2>
    <div class="big-xp pop">+${res.xp} XP</div>
    <div class="pills" style="justify-content:center"><span class="pill">Level ${res.progress.level}${res.leveled ? " ⬆️ LEVEL UP" : ""}</span><span class="pill">🔥 ${res.streak} streak</span></div>
    ${res.freeze ? `<p class="muted small">❄️ This month's streak freeze kept your streak alive.</p>` : ""}
    ${res.prs.length ? `<div class="card" style="background:var(--good-soft)"><h3>New personal bests</h3>${res.prs.map(x => `<div>🏆 ${esc(x)}</div>`).join("")}</div>` : ""}
    ${res.badges.length ? `<div class="card"><h3>Badges unlocked</h3>${res.badges.map(b => `<div>${BADGE[b].emoji} <b>${esc(BADGE[b].name)}</b> — ${esc(BADGE[b].desc)}</div>`).join("")}</div>` : ""}
    <div class="card coach-card"><h3>🧢 Coach's write-up</h3>${coachOn() ? `<p class="recap" id="recap-text" style="margin:0">Writing it up…</p>` : `<p class="muted small" style="margin:0 0 8px">Claude writes it with today's numbers filled in.</p><button class="btn sm${teen ? " teen" : ""}" data-act="recap-claude">Get the write-up in Claude</button>`}</div>
    <button class="btn big${teen ? " teen" : ""}" data-act="summary-done">Back home</button></div>`;
  chime("win"); confetti(res.prs.length || res.leveled ? 120 : 70);
  sessionRecap(p, session, res, sets, w);
}
ACTIONS["summary-done"] = () => { $("w-finish").hidden = false; document.querySelector(".coachbtn").hidden = false; show("home"); };
