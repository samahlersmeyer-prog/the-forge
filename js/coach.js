// coach.js: Claude as the household strength coach.
//  • Coach tab: chat about lifts, form, soreness, speed (knows the plan, recent sessions and bests).
//  • In a workout: "🧢 Coach" can adjust TODAY's workout (swap, remove, sets, lighter load). Every change is
//    checked here before it's applied, and teen safety rules are enforced in code, not just in the prompt.
//  • Write-ups: a short post-workout recap and a weekly family recap.
// The calls go through the Apps Script (server/Code.gs), which holds the API key and the safety prompts.

const CORE_PATTERN_IDS = ["back_squat", "deadlift", "bench_press", "power_clean", "goblet_squat", "trap_bar_deadlift", "db_bench_press", "hang_clean_pull", "hang_power_clean"];
const corePattern = id => (CORE_PATTERN_IDS.includes(id) ? EX[id].core_lift : null);
const ADULT_ONLY = ["deadlift", "power_clean"];

// ---------- context the coach sees ----------
function lifterContext(p) {
  const prog = progressOf(p.id), plan = activePlan(p.id), mine = sessionsOf(p.id), sets = setsOf(p.id);
  const L = [];
  L.push(`LIFTER: ${p.name} — ${isTeen(p) ? "teen athlete" : "adult"}, age ${p.age}, ${p.bodyweight} lb, ${p.experience}, goal ${p.goal}, ${p.days_per_week} days/week, ${p.session_length}-min sessions${p.form_focus_mode ? ", form-focus mode on" : ""}.`);
  L.push(`PROGRESS: level ${prog.level}, ${prog.xp} XP, streak ${prog.streak} (longest ${prog.longest || 0}), ${mine.length} workouts logged.`);
  const bests = CORE_LIFTS.map(l => { const xs = sets.filter(s => corePattern(s.exercise_id) === l && s.weight > 0); const t = xs.sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0]; return t ? `${LIFT_NAME[l]} ${t.weight}×${t.reps} (${EX[t.exercise_id].name})` : null; }).filter(Boolean);
  if (bests.length) L.push("BEST SETS: " + bests.join("; ") + ".");
  const ms = metricsOf(p.id), drills = [...new Set(ms.map(m => m.drill))];
  if (drills.length) L.push("DRILLS: " + drills.map(d => { const xs = ms.filter(m => m.drill === d); const v = xs.map(m => m.value); return `${d} best ${xs[0].unit === "sec" ? Math.min(...v) + "s" : Math.max(...v) + "in"}, last ${v[v.length - 1]}`; }).join("; ") + ".");
  if (plan) {
    const up = nextDay(plan, mine);
    L.push(`PLAN: ${plan.description}. Days: ${plan.days.map(d => d.name + (d.suggested_weekday ? " (" + d.suggested_weekday + ")" : "")).join(", ")}. Next up: ${up.name}.`);
    L.push(`NEXT WORKOUT (${up.name}): ` + up.items.filter(i => i.block !== "warmup" && i.block !== "mobility").map(i => {
      const ex = EX[i.exercise_id], s = suggest(p, i, ex, sets.filter(x => x.exercise_id === i.exercise_id));
      return `${ex.name} ${doseText(i)}${ex.measure === "lb" && s.weight ? " @" + s.weight : ""}`; }).join("; ") + ".");
  }
  const recent = mine.slice(0, 5);
  if (recent.length) L.push("RECENT SESSIONS:\n" + recent.map(s => {
    const xs = sets.filter(x => x.session_id === s.id), by = {};
    xs.forEach(x => (by[x.exercise_id] = by[x.exercise_id] || []).push(x));
    const parts = Object.keys(by).filter(id => EX[id] && EX[id].measure === "lb").map(id => `${EX[id].name} ${by[id].map(x => x.weight + "×" + x.reps + (x.form ? "f" + x.form : "")).join(",")}`);
    return `• ${s.date} ${s.day_name}: ${parts.join("; ") || "drills"}${(s.prs || []).length ? " | PRs: " + s.prs.join(", ") : ""}${s.notes ? " | notes: " + s.notes : ""}${s.parent_notes ? " | parent: " + s.parent_notes : ""}`;
  }).join("\n"));
  return L.join("\n");
}


// ---------- free mode: Coach runs in your own Claude app ----------
// With no API key on the Sheet, every Coach feature opens Claude (claude.ai / the Claude app) with the
// question, the coaching rules and this lifter's numbers already filled in. Free with a Claude account.
const coachOn = () => !!SERVER && store.get("af:coach", false) === true;
const FREE_RULES = teen => [
  "You're my strength & conditioning coach. Our household trains in a home weight room: one core lift per session (squat, bench, clean, deadlift each get their own day), speed/agility/jumps open every lifting day, double progression on the core lifts.",
  "Be direct, specific and encouraging; keep it short enough to read between sets. Use only the numbers below.",
  "Safety: sharp or joint pain, numbness, dizziness or chest pain means stop that exercise and see a doctor — don't coach through it.",
  teen ? "This is about my 13-year-old son. Form first: never suggest max testing or going heavier than the weights below, no diet or supplement advice, and anything that hurts means he stops and tells me." : "This is about me (adult, former college athlete).",
].join("\n");
function openInClaude(prompt) {
  const text = prompt.length > 6500 ? prompt.slice(0, 6500) + "\n…" : prompt;
  try { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); } catch (e) {}
  window.open("https://claude.ai/new?q=" + encodeURIComponent(text), "_blank");
  toast("Opening Claude… (also copied, in case you need to paste)", 2600);
}
const claudePrompt = (p, ask, extra) => `${FREE_RULES(isTeen(p))}\n\n${lifterContext(p)}${extra ? "\n\n" + extra : ""}\n\nQUESTION: ${ask}`;
const FREE_NOTE = p => isTeen(p)
  ? "Coach opens in Claude with ${name}'s plan and numbers filled in. Claude accounts are for adults, so ${name}'s questions go through Dad's Claude.".replace(/\$\{name\}/g, esc(p.name))
  : "Coach opens in your Claude app with your plan, numbers and recent workouts already filled in — free with your Claude account.";

// ---------- Coach tab ----------
function coachLog(pid) { return rows("Coach").filter(c => c.profile_id === pid).sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-30); }
function renderCoach() {
  const p = profile(); if (!p) return;
  const log = coachLog(p.id);
  const quick = isTeen(p)
    ? ["How do I get faster off the line?", "My legs are sore, what should I do?", "What should I focus on in my squat?", "How do I jump higher?"]
    : ["What should I focus on this week?", "My lower back is tight — adjust today?", "How's my progress looking?", "Best warm-up for heavy squats?"];
  let h = coachOn()
    ? `<div class="msg coach">Hey ${esc(p.name)} — I know your plan, your recent sessions and your numbers. Ask me about form, soreness, speed, or what's next.${isTeen(p) ? "" : " During a workout, tap 🧢 Coach to change today's session."}</div>`
    : `<div class="msg coach">${FREE_NOTE(p)} Ask about form, soreness, speed, or what's next.</div>`;
  log.forEach(c => { h += `<div class="msg me">${esc(c.q)}</div><div class="msg coach">${esc(c.a)}</div>`; });
  h += `<div class="quick" id="coach-quick">${quick.map(q => `<button data-act="ask-quick">${esc(q)}</button>`).join("")}</div>`;
  $("coach-body").innerHTML = h;
  $("coach-body").scrollTop = 1e6;
}
ACTIONS["ask-quick"] = el => askChat(el.textContent);
$("coach-form").addEventListener("submit", e => { e.preventDefault(); const q = $("coach-in").value.trim(); if (q) { $("coach-in").value = ""; askChat(q); } });
function askChat(q) {
  const p = profile(), body = $("coach-body");
  if (!coachOn()) return openInClaude(claudePrompt(p, q));
  const qe = $("coach-quick"); if (qe) qe.remove();
  body.insertAdjacentHTML("beforeend", `<div class="msg me">${esc(q)}</div><div class="msg coach typing" id="typing">Thinking…</div>`);
  body.scrollTop = 1e6; $("coach-send").disabled = true;
  const history = coachLog(p.id).slice(-6).map(c => ({ q: c.q, a: c.a }));
  api("coach", { profile_id: p.id, teen: isTeen(p), name: p.name, mode: "chat", question: q, context: lifterContext(p), history })
    .then(r => { DB.Coach[r.id] = { id: r.id, profile_id: p.id, ts: Date.now(), mode: "chat", q, a: r.reply }; saveDB(); renderCoach(); })
    .catch(e => { const t = $("typing"); if (t) { t.classList.remove("typing"); t.textContent = errText(e); } })
    .finally(() => { $("coach-send").disabled = false; });
}

// ---------- adjust today's workout ----------
ACTIONS["coach-adjust"] = () => {
  const p = profile();
  const chips = ["Something's sore", "Short on time — 30 min", "Equipment's taken", "Low energy today", "Feeling great"];
  openModal(`<h2>🧢 Coach</h2><p class="muted" style="margin:0">${coachOn() ? "Tell Coach what's going on. He can change today's workout — your plan stays the same." : "Tell Coach what's going on — Claude opens with today's workout filled in."}</p>
    <div class="quick">${chips.map(c => `<button data-act="adj-chip">${esc(c)}</button>`).join("")}</div>
    <textarea id="adj-q" placeholder="${isTeen(p) ? "e.g. my knee feels weird on squats" : "e.g. lower back is tight, swap deadlifts?"}"></textarea>
    <button class="btn big${isTeen(p) ? " teen" : ""}" data-act="adj-send">${coachOn() ? "Ask Coach" : "Ask in Claude"}</button><div id="adj-out"></div>`);
};
ACTIONS["adj-chip"] = el => { $("adj-q").value = el.textContent + (el.textContent.startsWith("Something") ? ": " : ""); $("adj-q").focus(); };
ACTIONS["adj-send"] = el => {
  const q = $("adj-q").value.trim(); if (!q) return;
  const p = profile();
  if (!coachOn()) {
    const today = W.items.map((it, i) => `${EX[it.exercise_id].name} ${doseText(it)}${W.done[i] ? " (done)" : ""}`).join("; ");
    openInClaude(claudePrompt(p, q + "\nHow should I change TODAY's workout? Keep it to simple swaps, fewer sets, or lighter weight.", `TODAY'S WORKOUT (${W.day_name}): ${today}`));
    $("adj-out").innerHTML = `<p class="muted small">Make Claude's changes here with Skip exercise, the weight buttons, or fewer sets.</p>`;
    return;
  }
  el.disabled = true; $("adj-out").innerHTML = `<p class="muted">Coach is looking at your workout…</p>`;
  const today = W.items.map((it, i) => {
    const ex = EX[it.exercise_id], s = suggest(p, it, ex, setsOf(p.id).filter(x => x.exercise_id === it.exercise_id));
    return `${it.exercise_id} | ${ex.name} | ${doseText(it)}${ex.measure === "lb" ? " @" + (it.load_override || s.weight || "?") + " lb" : ""} | ${W.done[i] ? "DONE" : (W.logged[i] || []).length ? "in progress" : "not started"}`;
  }).join("\n");
  const pool = EXERCISES.filter(e => !isTeen(p) || (e.teen_friendly && !ADULT_ONLY.includes(e.id))).map(e => `${e.id}: ${e.name} [${e.category}]`).join("\n");
  const context = lifterContext(p) + `\n\nTODAY'S WORKOUT (${W.day_name}) — id | name | dose | status:\n${today}\n\nEXERCISE LIST (valid ids for swaps):\n${pool}`;
  api("coach", { profile_id: p.id, teen: isTeen(p), name: p.name, mode: "adjust", question: q, context })
    .then(r => {
      DB.Coach[r.id] = { id: r.id, profile_id: p.id, ts: Date.now(), mode: "adjust", q, a: r.reply }; saveDB();
      const ok = vetChanges(p, r.changes || []);
      window.__pending = { q, reply: r.reply, changes: ok };
      $("adj-out").innerHTML = `<div class="msg coach" style="max-width:100%">${esc(r.reply)}</div>` +
        (ok.length ? ok.map(c => `<div class="change">${esc(describeChange(c))}</div>`).join("") + `<button class="btn big good" data-act="adj-apply">Apply ${ok.length} change${ok.length > 1 ? "s" : ""}</button>` : "") +
        ((r.changes || []).length > ok.length ? `<p class="muted small">${(r.changes || []).length - ok.length} suggestion${(r.changes || []).length - ok.length > 1 ? "s" : ""} skipped — ${isTeen(p) ? "the app never raises a teen's weight, adds sets, or swaps in a second core lift" : "they didn't fit today's workout"}.</p>` : "");
    })
    .catch(e => { $("adj-out").innerHTML = `<p class="err">${esc(errText(e))}</p>`; })
    .finally(() => { el.disabled = false; });
};

// Only changes that are safe and make sense get through.
function vetChanges(p, list) {
  const teen = isTeen(p), out = [];
  list.forEach(c => {
    const i = W.items.findIndex((it, k) => it.exercise_id === c.exercise_id && !W.done[k]);
    if (i < 0) return;
    const it = W.items[i];
    if (c.action === "remove") out.push({ action: "remove", i, exercise_id: it.exercise_id });
    else if (c.action === "sets") { const n = Math.round(+c.sets); if (n >= 1 && n <= 6 && n !== it.sets && !(teen && n > it.sets)) out.push({ action: "sets", i, exercise_id: it.exercise_id, sets: n }); }
    else if (c.action === "load") {
      const ex = EX[it.exercise_id], s = suggest(p, it, ex, setsOf(p.id).filter(x => x.exercise_id === it.exercise_id)), n = Math.round(+c.load_lb / 2.5) * 2.5;
      if (ex.measure === "lb" && n >= 0 && !(teen && n > (it.load_override || s.weight))) out.push({ action: "load", i, exercise_id: it.exercise_id, load_lb: n });
    } else if (c.action === "swap") {
      const to = EX[c.to];
      if (!to || to.id === it.exercise_id) return;
      if (teen && (!to.teen_friendly || ADULT_ONLY.includes(to.id))) return;
      const from = corePattern(it.exercise_id), into = corePattern(to.id);
      if (into && into !== from) return; // never turns today into a second core-lift day
      if (into && W.items.some((x, k) => k !== i && corePattern(x.exercise_id))) return;
      out.push({ action: "swap", i, exercise_id: it.exercise_id, to: to.id });
    }
  });
  return out;
}
function describeChange(c) {
  const n = EX[c.exercise_id].name;
  return { remove: `Remove ${n}`, sets: `${n}: ${c.sets} set${c.sets > 1 ? "s" : ""}`, load: `${n}: ${c.load_lb} lb`, swap: `Swap ${n} → ${c.to && EX[c.to].name}` }[c.action];
}
ACTIONS["adj-apply"] = () => {
  const pend = window.__pending; if (!pend) return;
  const removes = [];
  pend.changes.forEach(c => {
    const it = W.items[c.i];
    if (c.action === "sets") { it.sets = c.sets; it.coached = `Coach: ${c.sets} set${c.sets > 1 ? "s" : ""} today.`; }
    if (c.action === "load") { it.load_override = c.load_lb; it.coached = `Coach: ${c.load_lb} lb today.`; }
    if (c.action === "swap") {
      const to = EX[c.to], lb = to.measure === "lb";
      W.items[c.i] = Object.assign({}, it, { exercise_id: to.id, block: to.category === "Power" ? "power" : to.category === "Speed" || to.category === "Agility" ? "speed" : it.block === "strength" || it.block === "accessory" ? it.block : "accessory",
        progression: lb ? "double" : "none", load_lb: undefined, load_override: undefined, coached: `Swapped in for ${EX[c.exercise_id].name}.` });
    }
    if (c.action === "remove") removes.push(c.i);
  });
  removes.sort((a, b) => b - a).forEach(i => { W.items.splice(i, 1); const L = {}, D = {}; Object.keys(W.logged).forEach(k => { const n = +k; if (n !== i) L[n > i ? n - 1 : n] = W.logged[k]; }); Object.keys(W.done).forEach(k => { const n = +k; if (n !== i) D[n > i ? n - 1 : n] = W.done[k]; }); W.logged = L; W.done = D; });
  W.idx = Math.min(W.idx, W.items.length - 1);
  W.coach.push({ q: pend.q, reply: pend.reply, changes: pend.changes.map(describeChange) });
  W.cur = null; window.__pending = null; saveW(); closeModal(); renderWorkout(); toast("Coach's changes applied 🧢");
};

// ---------- write-ups ----------
function sessionRecap(p, session, res, sets, w) {
  const by = {}; sets.forEach(s => (by[s.exercise_id] = by[s.exercise_id] || []).push(s));
  const lines = Object.keys(by).map(id => { const ex = EX[id];
    return `${ex.name}: ` + by[id].map(s => ex.measure === "lb" ? `${s.weight}×${s.reps}${s.form ? " f" + s.form : ""}${s.rpe ? " @" + s.rpe : ""}` : s.result ? s.result + (ex.measure === "sec" ? "s" : "in") : s.reps + (s.form ? " f" + s.form : "")).join(", "); });
  const ctx = `${lifterContext(p)}\n\nTODAY: ${session.day_name}, ${session.duration_min} min, +${res.xp} XP, streak ${res.streak}${res.leveled ? ", leveled up to " + res.progress.level : ""}.
PRs today: ${res.prs.join(", ") || "none"}. Badges: ${res.badges.map(b => BADGE[b].name).join(", ") || "none"}.
Sets (f = form 1–5, @ = RPE):\n${lines.join("\n")}
${session.notes ? "Lifter notes: " + session.notes : ""}${session.parent_notes ? "\nParent notes: " + session.parent_notes : ""}${w.coach.length ? "\nCoach changes today: " + w.coach.map(c => c.changes.join("; ")).join(" | ") : ""}`;
  if (!coachOn()) { window.__recapPrompt = claudePrompt(p, "Write my 3–4 sentence post-workout write-up: what went well with real numbers, one thing to focus on next time, and an encouraging closer.", ctx); return; }
  api("recap", { kind: "session", teen: isTeen(p), name: p.name, context: ctx })
    .then(r => { const t = $("recap-text"); if (t) t.textContent = r.text; put("Sessions", Object.assign({}, session, { recap: r.text })); })
    .catch(e => { const t = $("recap-text"); if (t) t.textContent = errText(e); });
}

ACTIONS["recap-claude"] = () => window.__recapPrompt && openInClaude(window.__recapPrompt);
ACTIONS["week-recap"] = () => {
  const wk = mondayOf(todayISO()), have = DB.Recaps["week:" + wk];
  if (!coachOn()) {
    const ctx = profiles().map(p => { const ss = sessionsOf(p.id).filter(s => s.date >= wk);
      return `${p.name} (${isTeen(p) ? "teen" : "adult"}), streak ${progressOf(p.id).streak}:\n` + (ss.length ? ss.map(s => `• ${s.date} ${s.day_name} +${s.xp} XP${(s.prs || []).length ? " PRs: " + s.prs.join(", ") : ""}${s.parent_notes ? " parent: " + s.parent_notes : ""}`).join("\n") : "• no sessions yet"); }).join("\n\n");
    return openInClaude(`${FREE_RULES(false)}\nWrite our family's weekly training recap (dad + 13-year-old son): 2–3 short lines each with real numbers, one line of friendly family competition, one focus for next week each. Teen: praise effort and form only, no max testing or diet talk.\n\nWeek of ${wk}:\n${ctx}`);
  }
  const write = () => {
    $("modal-body").innerHTML = `<h2>🧢 This week</h2><p class="muted">Coach is writing the family recap…</p>`;
    const ctx = profiles().map(p => {
      const ss = sessionsOf(p.id).filter(s => s.date >= wk);
      return `${p.name} (${isTeen(p) ? "teen" : "adult"}), streak ${progressOf(p.id).streak}, level ${progressOf(p.id).level}:\n` +
        (ss.length ? ss.map(s => `• ${s.date} ${s.day_name} +${s.xp} XP${(s.prs || []).length ? " PRs: " + s.prs.join(", ") : ""}${s.notes ? " notes: " + s.notes : ""}${s.parent_notes ? " parent: " + s.parent_notes : ""}`).join("\n") : "• no sessions yet this week");
    }).join("\n\n");
    api("recap", { kind: "week", week: wk, context: `Week of ${wk}.\n\n${ctx}` })
      .then(r => { DB.Recaps["week:" + wk] = { id: "week:" + wk, week: wk, text: r.text, updated: Date.now() }; saveDB(); openWeek(); })
      .catch(e => { $("modal-body").innerHTML = `<h2>🧢 This week</h2><p class="err">${esc(errText(e))}</p>`; });
  };
  const openWeek = () => {
    const r = DB.Recaps["week:" + wk];
    openModal(`<h2>🧢 Week of ${new Date(wk + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</h2><p class="recap">${esc(r.text)}</p><button class="btn ghost" data-act="week-redo">Rewrite with the latest</button>`, () => refresh());
  };
  ACTIONS["week-redo"] = write;
  if (have) openWeek(); else { openModal(""); write(); }
};
