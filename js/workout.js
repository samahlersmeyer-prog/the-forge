// workout.js: the in-gym screen. Big numbers, last time vs. today's target on every set, form rating,
// rest timer, hold timer, warm-up sets with plates, supersets, add/swap exercises, screen kept awake.
// Progress is saved on the phone after every tap, so a refresh or a dead battery never loses a workout.

let W = null; // the workout in progress
const wKey = (pid, planId, dayId) => `af:w:${pid}:${planId}:${dayId}`;
const FORM_WORDS = ["", "Rough", "Shaky", "OK", "Solid", "Perfect"];
const HOLD_IDS = ["plank", "side_plank", "farmer_carry"];

// ---------- start: quick check-in, then the workout ----------
ACTIONS.start = el => {
  const p = profile(), plan = activePlan(p.id), day = plan.days.find(d => d.day_id === el.dataset.day);
  closeModal();
  if (store.get(wKey(p.id, plan.id, day.day_id), null)) return beginWorkout(day.day_id); // resume
  RD = { day: day.day_id, sleep: 0, sore: 0, energy: 0 };
  renderReady();
};
let RD = null;
const READY_Q = [["sleep", "Sleep last night", ["😴 Rough", "😐 OK", "😃 Great"]], ["sore", "Soreness", ["🥵 Very sore", "🙂 A little", "💪 Fresh"]], ["energy", "Energy", ["🪫 Low", "🔋 OK", "⚡ High"]]];
function readyScore(r) { return r.sleep + r.sore + r.energy - 3; } // 0–6 once all three are answered
function renderReady() {
  const p = profile(), teen = isTeen(p), all = RD.sleep && RD.sore && RD.energy, sc = readyScore(RD);
  const tb = teen ? " teen" : "";
  openModal(`<h2>Quick check-in</h2><p class="muted" style="margin:0">${coaching() ? `How's ${esc(p.name)} feeling?` : "How are you feeling?"} Three taps.</p>
    ${READY_Q.map(([k, label, opts]) => `<div class="field"><label>${label}</label><div class="seg" style="grid-template-columns:repeat(3,1fr)">${opts.map((o, i) => `<button data-act="rd" data-k="${k}" data-v="${i + 1}" class="${RD[k] === i + 1 ? "on" : ""}">${o}</button>`).join("")}</div></div>`).join("")}
    ${!all ? `<button class="btn big${tb}" disabled>Answer all three</button>`
      : sc <= 2 ? `<div class="coachnote">Rough day — that's normal. The app can take ~10% off the main lifts and drop a set from accessories and sprints so you still train without digging a hole.</div>
        <button class="btn big${tb}" data-act="rd-go" data-light="1">Go lighter today (recommended)</button><button class="btn ghost" data-act="rd-go">Train as planned</button>`
      : `${sc >= 5 ? `<div class="coachnote" style="background:var(--good-soft)">Feeling great — own every rep today.${teen ? " Same weights as planned; great form is what unlocks more." : ""}</div>` : ""}<button class="btn big${tb}" data-act="rd-go">Start workout</button>`}
    <button class="link-btn" style="margin-top:0" data-act="rd-go" data-skip="1">Skip check-in</button>`);
}
ACTIONS.rd = el => { RD[el.dataset.k] = +el.dataset.v; renderReady(); };
ACTIONS["rd-go"] = el => {
  const r = RD; RD = null; closeModal();
  const ready = el.dataset.skip ? null : { sleep: r.sleep, sore: r.sore, energy: r.energy, score: readyScore(r), light: !!el.dataset.light };
  beginWorkout(r.day, ready);
};

function beginWorkout(dayId, ready) {
  const p = profile(), plan = activePlan(p.id), day = plan.days.find(d => d.day_id === dayId);
  const key = wKey(p.id, plan.id, day.day_id);
  W = store.get(key, null);
  if (!W) {
    W = { key, pid: p.id, plan_id: plan.id, day_id: day.day_id, day_name: day.name, started: Date.now(),
      items: JSON.parse(JSON.stringify(day.items)), logged: {}, done: {}, ramp: {}, idx: 0, notes: "", parent: "", coach: [], ready: ready || null, ss: true };
    if (ready && ready.light) lighten(p);
  }
  W.cur = null;
  $("w-finish").hidden = false; $("w-menu").hidden = false;
  show("workout");
  wakeLock();
}
// Check-in said rough day: main lifts ~10% lighter, one less set on accessories and sprints. Never heavier.
function lighten(p) {
  W.items.forEach(it => {
    const ex = EX[it.exercise_id];
    if (ex.measure === "lb" && it.progression === "double" && (it.block === "strength" || it.block === "power")) {
      const s = suggest(p, it, ex, setsOf(p.id).filter(x => x.exercise_id === it.exercise_id));
      if (s.weight) { it.load_override = Math.max(ex.per_hand ? 5 : 45, Math.floor((s.weight * 0.9) / 5) * 5); it.override_reason = "Check-in said rough day — about 10% lighter. Crisp reps."; it.coached = "Lighter day from your check-in."; }
    } else if ((it.block === "accessory" && it.sets > 1) || (it.block === "speed" && it.sets > 2)) { it.sets--; it.coached = "One less set — lighter day from your check-in."; }
  });
}
const saveW = () => { const c = W.cur; delete W.cur; store.set(W.key, W); W.cur = c; };

let lock = null;
function wakeLock() { try { navigator.wakeLock && navigator.wakeLock.request("screen").then(l => (lock = l)).catch(() => {}); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && active === "workout") { wakeLock(); tickRest(); tickHold(); } });

// ---------- supersets: back-to-back accessories pair up as A1/A2, B1/B2 ----------
function pairsOf(items) {
  const out = {}; let n = 0;
  for (let i = 0; i < items.length - 1; i++) {
    if (items[i].block === "accessory" && items[i + 1].block === "accessory") {
      const L = "ABCDEF"[n++] || "Z";
      out[i] = { with: i + 1, tag: L + "1" }; out[i + 1] = { with: i, tag: L + "2" }; i++;
    }
  }
  return out;
}
const pairs = () => (W && W.ss !== false ? pairsOf(W.items) : {});

// ---------- warm-up sets + plates ----------
const BAR = 45, PLATES = [45, 35, 25, 10, 5, 2.5];
const isBarbell = ex => /barbell|trap|hex/i.test(ex.equipment || "") && !ex.per_hand;
function platesFor(total, ex) {
  if (!isBarbell(ex) || !(total > 0)) return "";
  if (total < BAR) return "Under bar weight (45)";
  let side = (total - BAR) / 2; if (!side) return "Empty bar";
  const out = [];
  PLATES.forEach(pl => { while (side >= pl - 1e-9) { out.push(pl); side -= pl; } });
  return "Per side: " + out.join(" · ") + (side > 0.01 ? ` (+${+side.toFixed(2)} short)` : "");
}
function rampSets(p, it, ex, work) {
  if (!work || ex.measure !== "lb" || it.progression !== "double" || !(it.block === "strength" || it.block === "power") || !corePattern(it.exercise_id)) return [];
  const bar = isBarbell(ex), min = bar ? BAR : 5, r5 = x => Math.max(min, Math.round(x / 5) * 5);
  const scheme = ex.per_hand ? [[0.5, 8]] : isTeen(p) ? [[0.5, 5], [0.7, 5]] : bar ? [[0, 10], [0.5, 5], [0.7, 3], [0.85, 1]] : [[0.5, 8], [0.75, 4]];
  const seen = new Set();
  return scheme.map(([f, r]) => ({ w: f ? r5(work * f) : BAR, r })).filter(x => x.w < work && !seen.has(x.w) && seen.add(x.w));
}

function cur() {
  const p = profile(), it = W.items[W.idx], ex = EX[it.exercise_id];
  const hist = setsOf(p.id).filter(s => s.exercise_id === it.exercise_id);
  let sug = suggest(p, it, ex, hist);
  if (it.load_override != null) sug = Object.assign({}, sug, { weight: it.load_override, kind: "hold", reason: it.override_reason || "Coach adjusted today's weight." });
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
  const c = cur(), teen = isTeen(c.p), tb = teen ? " teen" : "", PR = pairs();
  if (!W.cur || W.cur.idx !== W.idx || W.cur.setNo !== c.setNo) {
    const last = c.logged[c.logged.length - 1];
    W.cur = { idx: W.idx, setNo: c.setNo, weight: last ? last.weight : c.sug.weight || 0,
      reps: c.holdIt ? c.it.time_sec : c.sug.reps[c.setNo] || (last && last.reps) || c.it.rep_min, form: 0, rpe: 0, result: "" };
  }
  const doneN = W.items.filter((_, i) => W.done[i]).length;
  $("w-title").textContent = `${profile().avatar} ${W.day_name}`;
  $("w-sub").textContent = `${Math.floor((Date.now() - W.started) / 60000)} min · ${doneN}/${W.items.length} done`;
  $("w-finish").className = "btn sm" + (doneN === W.items.length ? " good" : " ghost");
  $("w-chips").innerHTML = W.items.map((it, i) => `<button data-act="w-go" data-i="${i}" class="${i === W.idx ? "on" : ""} ${W.done[i] ? "done" : ""} ${it.coached ? "coached" : ""}">${W.done[i] ? "✓ " : ""}${PR[i] ? `<i class="ss">${PR[i].tag}</i>` : ""}${esc(EX[it.exercise_id].name)}</button>`).join("");
  const onChip = $("w-chips").children[W.idx]; if (onChip) onChip.scrollIntoView({ inline: "center", block: "nearest" });

  const { it, ex, sug, prevSess, logged } = c;
  const pr = PR[W.idx];
  const ramp = !logged.length && !W.done[W.idx] ? rampSets(c.p, it, ex, sug.weight) : [];
  const notes = ramp.length ? (it.notes || "").replace(/Ramp up:.*?work sets\.\s*/, "") : it.notes;
  let h = `<div><div class="w-kicker">${W.idx + 1} / ${W.items.length} · ${BLOCK[it.block]}${it.distance ? " · " + esc(it.distance) : ""}${pr ? ` · <span class="ss-k">Superset ${pr.tag} with ${esc(EX[W.items[pr.with].exercise_id].name)}</span>` : ""}</div>
    <div class="w-name">${esc(ex.name)}</div>
    <div class="w-dose">${doseText(it)}${it.rest_sec ? `<small>rest ${fmtRest(it.rest_sec)}${pr ? " after both" : ""}</small>` : ""}</div>
    ${notes ? `<p class="muted small" style="margin:6px 0 0">${esc(notes)}</p>` : ""}</div>`;
  if (it.coached) h += `<div class="coachnote">🧢 ${esc(it.coached)}</div>`;
  const firstTime = !prevSess && !W.done[W.idx];
  const learn = howBlock(ex, c.simple, "cues-box how-box" + (firstTime && !c.simple ? " new" : "")) +
    `<details class="cues-box" ${c.p.form_focus_mode || c.simple ? "open" : ""}><summary>Form cues</summary><ul>${(ex.form_cues || "").split("|").map(x => `<li>${esc(x.trim())}</li>`).join("")}</ul></details>`;

  if (c.simple) {
    // Warm-up / cool-down: optional countdown, then the movement list.
    h += holdUI(c, tb) || (W.done[W.idx] ? "" : `<button class="btn big line" data-act="ht-start">▶ Start ${fmtClock(it.time_sec || 300)} timer</button>`);
    h += learn;
    h += `<button class="btn huge${W.done[W.idx] ? " ghost" : tb}" data-act="w-done">${W.done[W.idx] ? "✓ Done" : "Mark done"}</button>`;
  } else {
    if (firstTime) h += `<p class="newtip">👀 First time doing this — tap <b>How to do it</b> below.</p>`;
    if (c.loaded || prevSess) {
      const w = c.loaded && sug.weight ? `${sug.weight} lb${ex.per_hand ? " each" : ""} × ` : "";
      h += `<div class="sugg ${sug.kind}"><b>Today: ${w}${c.holdIt ? it.time_sec + "s" : sug.reps.join(" / ")}</b>${sug.kind === "increase" ? " ⬆️" : ""}<p>${esc(sug.reason)}</p></div>`;
    }
    if (ramp.length) {
      const got = W.ramp[W.idx] || [];
      h += `<div class="ramp"><div class="flabel">Warm-up sets <span class="muted small" style="font-weight:500">— don't count, just get ready</span></div>${ramp.map((r, k) => {
        const pl = platesFor(r.w, ex);
        return `<button class="ramp-row${got.includes(k) ? " on" : ""}" data-act="w-ramp" data-k="${k}"><b>${r.w === BAR && isBarbell(ex) ? "Empty bar" : r.w + " lb" + (ex.per_hand ? " each" : "")} × ${r.r}</b><span class="muted small">${pl && r.w > BAR ? esc(pl.replace("Per side: ", "")) + " /side" : ""}</span><i>${got.includes(k) ? "✓" : ""}</i></button>`;
      }).join("")}</div>`;
    }
    h += `<div class="sets">` + Array.from({ length: Math.max(it.sets, logged.length) }, (_, i) => {
      const l = logged[i], pv = prevSess && prevSess[i];
      const goal = c.single || c.metric ? (it.distance || "") : `Goal ${c.loaded && sug.weight ? sug.weight + "×" : ""}${c.holdIt ? it.time_sec + "s" : sug.reps[i] || it.rep_min}`;
      return `<div class="set ${i === c.setNo && !W.done[W.idx] ? "on" : ""}"><span class="k">Set ${i + 1}</span><span class="p">${pv ? "Last " + fmtSet(pv, ex, c.holdIt) : "Last —"}</span><span>${l ? `<b>${fmtSet(l, ex, c.holdIt)}</b>${l.form ? ` <span class="muted small">f${l.form}</span>` : ""}` : `<span class="muted">${goal}</span>`}</span><span class="ok">${l ? "✓" : ""}</span></div>`;
    }).join("") + `</div>`;

    if (!W.done[W.idx]) {
      const u = W.cur;
      h += `<div class="entry">`;
      if (c.loaded) h += `<div class="step"><button data-act="w-step" data-k="weight" data-d="-${c.step}">−</button><input id="w-weight" inputmode="decimal" value="${u.weight}"><button data-act="w-step" data-k="weight" data-d="${c.step}">+</button></div><div class="step-l">${ex.per_hand ? "lb each hand" : "lb"}</div>${isBarbell(ex) ? `<div class="plates" id="w-plates">${esc(platesFor(u.weight, ex))}</div>` : ""}`;
      if (!c.metric && !c.single) h += `<div class="step"><button data-act="w-step" data-k="reps" data-d="${c.holdIt ? -5 : -1}">−</button><input id="w-reps" inputmode="numeric" value="${u.reps}"><button data-act="w-step" data-k="reps" data-d="${c.holdIt ? 5 : 1}">+</button></div><div class="step-l">${c.holdIt ? "seconds" : "reps"}</div>`;
      if (c.metric) h += `<div class="flabel">Best ${ex.measure === "sec" ? "time (seconds)" : "distance (inches)"} — optional</div><input id="w-result" class="result" inputmode="decimal" placeholder="${ex.measure === "sec" ? "1.92" : "84"}" value="${esc(u.result)}">`;
      if (c.formApplies) h += `<div class="flabel ${c.formReq ? "req" : ""}">Form quality ${c.formReq ? "(required)" : "(optional)"}</div>
        <div class="formq">${[1, 2, 3, 4, 5].map(f => `<button data-act="w-form" data-v="${f}" class="f${f} ${u.form === f ? "on" : ""}">${f}<small>${FORM_WORDS[f]}</small></button>`).join("")}</div>`;
      if (!teen && c.loaded) h += `<div class="rpe"><span>RPE</span>${[6, 7, 8, 9, 10].map(v => `<button data-act="w-rpe" data-v="${v}" class="${u.rpe === v ? "on" : ""}">${v}</button>`).join("")}</div>`;
      const blocked = c.formReq && !u.form;
      if (c.holdIt) h += holdUI(c, tb) || `<button class="btn huge${tb}" data-act="ht-start">▶ Start ${u.reps}s timer</button>
        <button class="btn line" data-act="w-log" ${blocked ? "disabled" : ""}>${blocked ? "Rate your form to log" : `Already did it — log set ${c.setNo + 1}`}</button>`;
      else h += `<button class="btn huge${tb}" data-act="w-log" ${blocked ? "disabled" : ""}>${blocked ? "Rate your form to log" : c.single || c.metric ? `Done — rep ${c.setNo + 1} of ${it.sets}` : `Log set ${c.setNo + 1}`}</button>`;
      h += `</div>`;
    }
    h += `<div class="row between"><button class="btn sm ghost" data-act="w-undo" ${logged.length ? "" : "disabled"}>↶ Undo last</button>${!W.done[W.idx] ? `<button class="btn sm ghost" data-act="w-done">${logged.length ? "Skip remaining sets" : "Skip exercise"}</button>` : ""}</div>`;
    h += learn;
  }
  h += `<div class="wnav"><button class="btn line" data-act="w-go" data-i="${W.idx - 1}" ${W.idx === 0 ? "disabled" : ""}>‹ Prev</button><button class="btn line" data-act="w-add">+ Add exercise</button><button class="btn line" data-act="w-go" data-i="${W.idx + 1}" ${W.idx === W.items.length - 1 ? "disabled" : ""}>Next ›</button></div>`;

  const allDone = W.items.every((_, i) => W.done[i]);
  if (allDone || teen) {
    h += `<div class="${allDone ? "finish-box" : "card"}">${allDone ? `<b style="font-size:18px">All done 💪</b>` : ""}
      ${teen ? `<div class="field"><label>👨 Parent notes</label><textarea id="w-parent" placeholder="Form, how he looked, anything to watch next time…">${esc(W.parent)}</textarea></div>` : ""}
      ${allDone ? `${dateField()}<div class="field"><label>Session notes</label><textarea id="w-notes" placeholder="How did it feel?">${esc(W.notes)}</textarea></div>
      <button class="btn huge good" data-act="finish">Finish & save</button>` : ""}</div>`;
  }
  $("w-body").innerHTML = h;
  ["w-parent", "w-notes"].forEach(id => { const t = $(id); if (t) t.addEventListener("input", () => { W[id === "w-parent" ? "parent" : "notes"] = t.value; saveW(); }); });
  const wd = $("w-date"); if (wd) wd.addEventListener("change", () => { W.date = wd.value; saveW(); });
  ["weight", "reps", "result"].forEach(k => { const i = $("w-" + k); if (i) { i.addEventListener("focus", () => i.select()); i.addEventListener("input", () => { W.cur[k] = k === "result" ? i.value : +i.value || 0; if (k === "weight") platesLive(); }); } });
}
function platesLive() { const el = $("w-plates"); if (el && W) el.textContent = platesFor(W.cur.weight, EX[W.items[W.idx].exercise_id]); }
// Which day the workout counts for: today, or up to a week back when you're typing in numbers after the fact.
function dateField() {
  const today = todayISO(), opts = [];
  for (let i = 0; i < 8; i++) { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - i); const iso = d.toISOString().slice(0, 10);
    opts.push(`<option value="${iso}" ${iso === (W.date || today) ? "selected" : ""}>${i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</option>`); }
  return `<div class="field"><label>Workout day</label><select id="w-date">${opts.join("")}</select></div>`;
}
function fmtSet(x, ex, holdIt) {
  if (ex.measure === "sec") return x.result ? x.result + "s" : "✓";
  if (ex.measure === "in") return x.result ? x.result + '"' : "✓";
  if (holdIt) return x.reps + "s";
  if (ex.measure === "bw") return x.reps === 1 ? "✓" : x.reps + " reps";
  return `${x.weight}×${x.reps}`;
}

ACTIONS["w-go"] = el => { const i = +el.dataset.i; if (i >= 0 && i < W.items.length) { stopHold(); W.idx = i; saveW(); renderWorkout(); $("w-body").scrollTop = 0; } };
ACTIONS["w-step"] = el => { const k = el.dataset.k; W.cur[k] = Math.max(0, +(W.cur[k] + +el.dataset.d).toFixed(2)); $("w-" + k).value = W.cur[k]; if (k === "weight") platesLive(); buzz(8); };
ACTIONS["w-form"] = el => { const v = +el.dataset.v; W.cur.form = W.cur.form === v ? 0 : v; renderWorkout(); };
ACTIONS["w-rpe"] = el => { const v = +el.dataset.v; W.cur.rpe = W.cur.rpe === v ? 0 : v; renderWorkout(); };
ACTIONS["w-ramp"] = el => { const k = +el.dataset.k, got = (W.ramp[W.idx] = W.ramp[W.idx] || []); const at = got.indexOf(k); if (at >= 0) got.splice(at, 1); else got.push(k); buzz(8); saveW(); renderWorkout(); };
function nextUndone(from) { for (let k = 1; k <= W.items.length; k++) { const j = (from + k) % W.items.length; if (!W.done[j]) return j; } return from; }
function logSet(reps) {
  const c = cur(), u = W.cur, r = +u.result;
  const set = { exercise_id: c.it.exercise_id, set_number: c.setNo + 1, weight: c.loaded ? u.weight : 0, reps: reps != null ? reps : c.single || c.metric ? 1 : u.reps,
    form: c.formApplies && u.form ? u.form : undefined, rpe: !isTeen(c.p) && c.loaded && u.rpe ? u.rpe : undefined, result: c.metric && r > 0 ? r : undefined };
  const list = (W.logged[W.idx] = (W.logged[W.idx] || []).concat([set]));
  buzz(15);
  let rest = c.it.rest_sec;
  if (list.length >= c.it.sets) W.done[W.idx] = true;
  const pr = pairs()[W.idx];
  if (pr && !W.done[pr.with]) {
    // superset: straight to the partner; rest only once both have done this round
    if ((W.logged[pr.with] || []).length < list.length) rest = 0;
    W.idx = pr.with;
  } else if (W.done[W.idx]) W.idx = nextUndone(W.idx);
  saveW(); renderWorkout();
  if (rest) startRest(rest); else if (pr && !W.done[W.idx]) toast(`Superset → ${EX[W.items[W.idx].exercise_id].name}`);
}
ACTIONS["w-log"] = () => logSet();
ACTIONS["w-done"] = () => { stopHold(); W.done[W.idx] = true; W.idx = nextUndone(W.idx); saveW(); renderWorkout(); };
ACTIONS["w-undo"] = () => { const l = W.logged[W.idx] || []; l.pop(); W.done[W.idx] = false; saveW(); renderWorkout(); };
ACTIONS["leave-workout"] = () => { stopRest(); stopHold(); show("home"); toast("Workout saved — resume anytime"); };

// ---------- hold timer (planks, carries, warm-up, cool-down) ----------
let HT = null, htT = null;
function holdUI(c, tb) {
  if (!HT || HT.idx !== W.idx) return "";
  return `<div class="ht${HT.lead ? " lead" : ""}"><small id="ht-k">${HT.lead ? "Get set…" : c.simple ? "Timer running" : "Hold it!"}</small><b id="ht-n">${fmtClock(htLeft())}</b>
    <div class="rest-bar"><i id="ht-fill" style="width:100%"></i></div>
    <div class="row"><button class="btn ghost grow" data-act="ht-cancel">Cancel</button>${c.simple ? `<button class="btn grow${tb}" data-act="ht-stop">Done</button>` : `<button class="btn grow${tb}" data-act="ht-stop">Stop & log</button>`}</div></div>`;
}
const htLeft = () => (!HT ? 0 : Math.max(0, Math.ceil(((HT.lead ? HT.leadEnd : HT.end) - Date.now()) / 1000)));
ACTIONS["ht-start"] = () => {
  const c = cur(), sec = c.simple ? c.it.time_sec || 300 : +W.cur.reps || c.it.time_sec || 30;
  stopRest();
  HT = { idx: W.idx, total: sec, simple: c.simple, lead: !c.simple, leadEnd: Date.now() + 3000, end: 0, last: 4 };
  if (c.simple) HT.end = Date.now() + sec * 1000;
  renderWorkout(); clearInterval(htT); htT = setInterval(tickHold, 200); tickHold();
};
function tickHold() {
  if (!HT || !W) return;
  if (HT.lead) {
    const l = htLeft();
    if (l !== HT.last && l > 0) { HT.last = l; chime("beep"); buzz(30); }
    if (l <= 0) { HT.lead = false; HT.end = Date.now() + HT.total * 1000; chime("go"); buzz(60); if (active === "workout") renderWorkout(); return; }
    const n = $("ht-n"); if (n) n.textContent = l;
    return;
  }
  const left = htLeft(), n = $("ht-n"), f = $("ht-fill");
  if (n) n.textContent = fmtClock(left);
  if (f) f.style.width = (100 * left) / HT.total + "%";
  if (left <= 0) finishHold(HT.total);
}
function finishHold(sec) {
  const h = HT; stopHold();
  if (!W || h.idx !== W.idx) return;
  chime("go"); buzz([200, 100, 200]); goFlash(h.simple ? "DONE" : "TIME");
  if (h.simple) { W.done[W.idx] = true; W.idx = nextUndone(W.idx); saveW(); return renderWorkout(); }
  const c = cur();
  W.cur.reps = sec;
  if (c.formReq && !W.cur.form) { renderWorkout(); return toast("Rate your form, then log the set", 2600); }
  logSet(sec);
}
function stopHold() { clearInterval(htT); HT = null; }
ACTIONS["ht-stop"] = () => { if (!HT) return; const done = HT.lead ? 0 : Math.max(1, HT.total - htLeft()); if (HT.lead) { stopHold(); return renderWorkout(); } finishHold(HT.simple ? HT.total : done); };
ACTIONS["ht-cancel"] = () => { stopHold(); renderWorkout(); };

// ---------- ⋯ menu: add / swap / remove / supersets / coach ----------
ACTIONS["w-menu"] = () => {
  const c = cur(), name = esc(c.ex.name), started = (W.logged[W.idx] || []).length > 0;
  openModal(`<h2>Today's workout</h2>
    <button class="menu-row" data-act="w-add"><b>＋ Add an exercise</b><small>Do something extra or different today</small></button>
    ${!W.done[W.idx] ? `<button class="menu-row" data-act="w-swap"><b>⇄ Swap ${name}</b><small>Equipment taken, something's sore, or just want a change</small></button>` : ""}
    ${!started ? `<button class="menu-row" data-act="w-remove"><b>✕ Remove ${name}</b><small>Just for today — your plan stays the same</small></button>` : ""}
    <button class="menu-row" data-act="w-ss"><b>${W.ss === false ? "Turn supersets on" : "Turn supersets off"}</b><small>${W.ss === false ? "Pair back-to-back accessories (A1/A2) to save time" : "Do every exercise on its own with full rest"}</small></button>
    <button class="menu-row" data-act="coach-adjust"><b>🧢 Ask Coach about today</b><small>Sore, short on time, low energy…</small></button>`);
};
ACTIONS["w-ss"] = () => { W.ss = W.ss === false; saveW(); closeModal(); renderWorkout(); toast(W.ss ? "Supersets on" : "Supersets off"); };
ACTIONS["w-remove"] = () => {
  if (W.items.length < 2) return;
  const n = EX[W.items[W.idx].exercise_id].name;
  removeItem(W.idx); noteEdit(`Removed ${n}`); closeModal(); saveW(); renderWorkout(); toast(`${n} removed for today`);
};
// keep logged/done/ramp lined up when items move
function shiftMaps(at, delta) {
  ["logged", "done", "ramp"].forEach(m => {
    const o = W[m] || {}, n = {};
    Object.keys(o).forEach(k => { const i = +k; if (delta < 0 && i === at) return; n[i >= at + (delta < 0 ? 1 : 0) ? i + delta : i] = o[k]; });
    W[m] = n;
  });
}
function removeItem(i) { W.items.splice(i, 1); shiftMaps(i, -1); W.idx = Math.min(i, W.items.length - 1); W.cur = null; }
function insertItem(i, item) { shiftMaps(i, 1); W.items.splice(i, 0, item); W.idx = i; W.cur = null; }
function noteEdit(txt) { W.coach.push({ q: "(changed by hand)", reply: "", changes: [txt] }); }

// A sensible dose for an exercise added or swapped in mid-workout.
function newItem(p, id) {
  const ex = EX[id], teen = isTeen(p), base = { exercise_id: id, rep_min: 1, rep_max: 1, progression: "none", notes: "" };
  if (ex.category === "Mobility") return Object.assign(base, { block: "mobility", sets: 1, time_sec: 300, rest_sec: 0 });
  if (HOLD_IDS.includes(id)) return Object.assign(base, { block: "accessory", sets: teen ? 2 : 3, time_sec: teen ? 20 : id === "farmer_carry" ? 40 : 30, rest_sec: id === "farmer_carry" ? 60 : 45, notes: id === "side_plank" ? "Time per side." : "" });
  if (ex.measure === "sec" || ex.category === "Speed" || ex.category === "Agility") return Object.assign(base, { block: "speed", sets: 3, rest_sec: ex.measure === "sec" ? 90 : 45, notes: ex.measure === "sec" ? "Log your best time." : "" });
  if (ex.category === "Power") return Object.assign(base, { block: "power", sets: 3, rep_min: ex.measure === "in" ? 3 : 5, rep_max: ex.measure === "in" ? 3 : 5, rest_sec: 60 });
  const lb = ex.measure === "lb";
  if (ex.category === "Strength") return Object.assign(base, { block: "strength", sets: teen ? 2 : 3, rep_min: teen ? 8 : 6, rep_max: 10, rest_sec: 120, progression: lb ? "double" : "none", notes: "About 2 reps in reserve on every set." });
  return Object.assign(base, { block: "accessory", sets: teen ? 2 : 3, rep_min: teen ? 10 : 8, rep_max: teen ? 15 : 12, rest_sec: teen ? 60 : 75, progression: lb ? "double" : "none",
    notes: lb ? "Pick a weight you could do for 2 more reps than the top of the range." : "" });
}
// One core lift per session (Sam's rule), teen-safe list, nothing already in today's workout.
function dayLift(skip) { const k = W.items.findIndex((x, i) => i !== skip && corePattern(x.exercise_id)); return k < 0 ? null : EX[W.items[k].exercise_id].core_lift; }
function canUse(p, id, swapIdx) {
  const ex = EX[id];
  if (isTeen(p) && (!ex.teen_friendly || ADULT_ONLY.includes(id))) return false;
  if (W.items.some((x, k) => k !== swapIdx && x.exercise_id === id)) return false;
  if (ex.core_lift && isTeen(p)) {
    // teen: core-lift variations only by swapping the day's own lift, and beginners stay on the technique versions
    if (swapIdx == null || !EX[W.items[swapIdx].exercise_id].core_lift) return false;
    if (p.experience === "beginner" && !TEEN_CORE_IDS.includes(id)) return false;
  }
  if (ex.core_lift) {
    const swapping = swapIdx != null ? EX[W.items[swapIdx].exercise_id].core_lift : null;
    const lift = dayLift(swapIdx) || swapping;
    if (!lift || ex.core_lift !== lift) return false;                       // no other day's lift
    if (corePattern(id) && dayLift(swapIdx)) return false;                  // never a second heavy core lift
  }
  return true;
}
let PK = null;
const PK_CATS = [["", "All"], ["Strength", "Strength"], ["Accessory", "Accessory"], ["Power", "Jumps & throws"], ["Speed", "Speed & agility"], ["Mobility", "Mobility"]];
function openPicker(mode) { PK = { mode, swap: mode === "swap" ? W.idx : null, q: "", cat: "" }; renderPicker(); }
function renderPicker() {
  const p = profile(), title = PK.mode === "swap" ? `Swap ${esc(EX[W.items[PK.swap].exercise_id].name)}` : "Add an exercise";
  openModal(`<h2>${title}</h2><input id="pk-q" class="search" placeholder="Search exercises…" value="${esc(PK.q)}" autocomplete="off">
    <div class="quick">${PK_CATS.map(([v, l]) => `<button data-act="pk-cat" data-v="${v}" class="${PK.cat === v ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="pk-list" class="pk-list"></div>
    <p class="muted small" style="margin:0">Lifts from other days are hidden — one core lift per session.${isTeen(p) ? " Only teen-safe exercises are shown." : ""}</p>`);
  const q = $("pk-q"); q.addEventListener("input", () => { PK.q = q.value; pickerList(); });
  pickerList();
}
function pickerList() {
  const p = profile(), q = PK.q.trim().toLowerCase();
  const xs = EXERCISES.filter(e => (!PK.cat || e.category === PK.cat || (PK.cat === "Speed" && e.category === "Agility")) && (!q || (e.name + " " + e.equipment).toLowerCase().includes(q)) && canUse(p, e.id, PK.swap));
  $("pk-list").innerHTML = xs.length ? xs.map(e => `<button class="pk-row" data-act="pk-pick" data-id="${e.id}"><b>${esc(e.name)}</b><small>${esc(e.category)} · ${esc(e.equipment)}</small></button>`).join("") : `<p class="muted small">Nothing matches.</p>`;
}
ACTIONS["pk-cat"] = el => { PK.cat = el.dataset.v; renderPicker(); };
ACTIONS["pk-pick"] = el => {
  const p = profile(), id = el.dataset.id, item = newItem(p, id);
  if (PK.mode === "swap") {
    const i = PK.swap, old = W.items[i], oldName = EX[old.exercise_id].name;
    if (isTeen(p)) item.sets = Math.min(item.sets, old.sets); // teen: never more sets
    W.items[i] = Object.assign(item, { order: old.order, coached: `Swapped in for ${oldName}.` });
    delete W.logged[i]; delete W.done[i]; delete W.ramp[i]; W.idx = i; W.cur = null;
    noteEdit(`Swapped ${oldName} → ${EX[id].name}`); toast(`Swapped in ${EX[id].name}`);
  } else {
    const end = W.items.length && W.items[W.items.length - 1].block === "mobility" ? W.items.length - 1 : W.items.length;
    insertItem(end, Object.assign(item, { coached: "Added today." }));
    noteEdit(`Added ${EX[id].name}`); toast(`Added ${EX[id].name}`);
  }
  PK = null; closeModal(); saveW(); renderWorkout(); $("w-body").scrollTop = 0;
};
ACTIONS["w-add"] = () => openPicker("add");
ACTIONS["w-swap"] = () => {
  if ((W.logged[W.idx] || []).length && !confirm("This drops the sets you've logged on this exercise. Swap anyway?")) return;
  openPicker("swap");
};

// ---------- rest timer ----------
let restEnd = 0, restTotal = 0, restT = null, rang = true;
function startRest(sec) {
  restTotal = sec; restEnd = Date.now() + sec * 1000; rang = false;
  $("rest").hidden = false; tickRest(); clearInterval(restT); restT = setInterval(tickRest, 250);
}
function tickRest() {
  if ($("rest").hidden) return;
  const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
  $("rest-n").textContent = left ? fmtClock(left) : "GO";
  $("rest").classList.toggle("go", !left);
  $("rest-fill").style.width = (restTotal ? (100 * left) / restTotal : 0) + "%";
  $("rest-skip").textContent = left ? "Skip" : "Close";
  if (left && left <= 3 && left !== tickRest.last) { tickRest.last = left; chime("beep"); }
  if (!left && !rang) { rang = true; chime("go"); buzz([200, 100, 200]); if (active === "workout") goFlash("GO"); }
  if (active === "workout" && W) $("w-sub").textContent = `${Math.floor((Date.now() - W.started) / 60000)} min · ${W.items.filter((_, i) => W.done[i]).length}/${W.items.length} done`;
}
const fmtClock = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
function stopRest() { clearInterval(restT); $("rest").hidden = true; }
ACTIONS["rest-add"] = () => { restEnd += 15000; restTotal += 15; rang = false; tickRest(); };
ACTIONS["rest-skip"] = () => stopRest();
$("go-flash").addEventListener("click", () => ($("go-flash").hidden = true));

// ---------- finish ----------
ACTIONS.finish = () => {
  const all = Object.keys(W.logged).flatMap(i => W.logged[i]);
  if (!all.length && !confirm("No sets logged yet. Finish anyway?")) return;
  stopRest(); stopHold();
  const p = profile(), date = W.date && W.date <= todayISO() ? W.date : todayISO(), sid = uid("s_");
  const prevLast = progressOf(p.id).last_date || "";
  const sets = all.map(s => Object.assign({ id: uid("x_"), session_id: sid, profile_id: p.id, date, is_pr: false }, s));
  const mine = sessionsOf(p.id);
  const res = scoreWorkout({ profile: p, progress: progressOf(p.id), date, day_id: W.day_id, sets, history: setsOf(p.id), metricsHistory: metricsOf(p.id),
    sessionsMine: mine, familyToday: rows("Sessions").some(s => s.profile_id !== p.id && s.date === date),
    allDone: W.items.every((it, i) => W.done[i] && (it.block === "warmup" || it.block === "mobility" || (W.logged[i] || []).length >= it.sets)) });
  const session = { id: sid, profile_id: p.id, date, plan_id: W.plan_id, day_id: W.day_id, day_name: W.day_name,
    duration_min: Math.max(1, Math.round((Date.now() - W.started) / 60000)), xp: res.xp, prs: res.prs, notes: W.notes,
    parent_notes: isTeen(p) ? W.parent : "", recap: "", coach_changes: W.coach.length ? W.coach : "", readiness: W.ready || "" };
  put("Sets", sets);
  put("Metrics", res.metrics.map(m => Object.assign({ id: uid("m_"), profile_id: p.id, date }, m)));
  put("Sessions", session);
  if (prevLast > date) res.progress.last_date = prevLast; // a back-dated workout doesn't rewind the streak clock
  put("Progress", Object.assign(res.progress, { id: p.id }));
  store.del(W.key);
  const finished = W; W = null;
  showSummary(p, session, res, sets, finished);
};

function showSummary(p, session, res, sets, w) {
  const teen = isTeen(p);
  $("w-chips").innerHTML = ""; $("w-sub").textContent = "Saved";
  $("w-finish").hidden = true; $("w-menu").hidden = true;
  $("w-body").innerHTML = `<div class="summary body" style="padding:0">
    <div style="font-size:60px" class="pop">${res.prs.length ? "🏆" : "🔥"}</div>
    <h2 style="font-family:var(--title);font-size:32px;margin:0">Workout saved</h2>
    <div class="big-xp pop">+${res.xp} XP</div>
    <div class="pills" style="justify-content:center"><span class="pill">Level ${res.progress.level}${res.leveled ? " ⬆️ LEVEL UP" : ""}</span><span class="pill">🔥 ${res.streak} streak</span></div>
    ${res.freeze ? `<p class="muted small">❄️ This month's streak freeze kept your streak alive.</p>` : ""}
    ${res.prs.length ? `<div class="card" style="background:var(--good-soft)"><h3>New personal bests</h3>${res.prs.map(x => `<div>🏆 ${esc(x)}</div>`).join("")}</div>` : ""}
    ${res.badges.length ? `<div class="card"><h3>Badges unlocked</h3>${res.badges.map(b => `<div>${BADGE[b].emoji} <b>${esc(BADGE[b].name)}</b> — ${esc(BADGE[b].desc)}</div>`).join("")}</div>` : ""}
    <div class="card coach-card"><h3>🧢 Coach's write-up</h3>${coachOn() ? `<p class="recap" id="recap-text" style="margin:0">Writing it up…</p>` : `<p class="muted small" style="margin:0 0 8px">Claude writes it with today's numbers filled in.</p><button class="btn sm${teen ? " teen" : ""}" data-act="recap-claude">Get the write-up in Claude</button>`}</div>
    <button class="btn big${teen ? " teen" : ""}" data-act="summary-done">Back home</button>
    <p class="tagline sm">“${TAGLINE}” <small>Proverbs 27:17</small></p></div>`;
  chime("win"); confetti(res.prs.length || res.leveled ? 120 : 70);
  sessionRecap(p, session, res, sets, w);
}
ACTIONS["summary-done"] = () => { $("w-finish").hidden = false; $("w-menu").hidden = false; show("home"); };
