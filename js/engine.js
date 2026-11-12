// The Forge engine: plan generator, double progression, PRs, XP/levels/streaks/badges.
// Pure functions only (no DOM, no storage), so tools/test-engine.mjs can check them.
//
// Programming rules (what a strength coach would check):
//  • ONE core lift per session: Squat, Bench, Clean and Deadlift each get their own day.
//  • Order: warm-up → speed/agility → jumps/throws → core lift → secondary → accessories → trunk → cool-down.
//  • Speed, agility and jumps open every lifting day (fresh legs) instead of needing separate days.
//    A 5-day week adds one light Athletic Day.
//  • 2–3 days/week: lifting days rotate Squat → Bench → Clean → Deadlift, so each lift keeps its own day.
//  • Weekly balance: pulling ≥ pushing, single-leg work, anti-rotation trunk work.
//  • Teen: technique variations for beginners, moderate reps, form gate, smaller jumps, no max testing,
//    16-lifting-set soft cap, never two lower-body lifting days in a row.

const CORE_LIFTS = ["squat", "bench", "clean", "deadlift"]; // also the rotation order
const LIFT_NAME = { squat: "Squat", bench: "Bench", clean: "Clean", deadlift: "Deadlift" };
const LIFT_DAY = { squat: "SQ", bench: "BP", clean: "CL", deadlift: "DL" };
const TEEN_MAX_WORK_SETS = 16;
const FULL_REST = "Full rest — walk back and wait. Every rep at max effort; stop if times slow down a lot.";

// ───────────── loads ─────────────

const e1rm = (w, r) => (!w || !r ? 0 : r === 1 ? w : Math.round(w * (1 + Math.min(r, 10) / 30)));
const weightForReps = (max, reps) => max / (1 + reps / 30);
const roundLoad = (x, inc = 5, min = 0) => Math.max(min, Math.round(x / inc) * inc);

const ADULT_DEFAULTS = {
  beginner: { squat: 0.6, deadlift: 0.8, bench: 0.45, clean: 0.35 },
  intermediate: { squat: 1.0, deadlift: 1.25, bench: 0.75, clean: 0.6 },
};
const TEEN_DEFAULTS = {
  goblet_squat: { beginner: 0.15, intermediate: 0.22, min: 10 },
  back_squat: { beginner: 0.45, intermediate: 0.55, min: 45 },
  trap_bar_deadlift: { beginner: 0.5, intermediate: 0.7, min: 45 },
  db_bench_press: { beginner: 0.1, intermediate: 0.14, min: 10 },
  bench_press: { beginner: 0.35, intermediate: 0.45, min: 45 },
  hang_clean_pull: { beginner: 0, intermediate: 0.35, min: 45 },
  hang_power_clean: { beginner: 0, intermediate: 0.3, min: 45 },
};
const BARBELL_MATCH = {
  squat: ["back_squat"], deadlift: ["deadlift", "trap_bar_deadlift"], bench: ["bench_press"], clean: ["power_clean", "hang_power_clean"],
};

// Starting work weight. Uses the entered best set when it's the same lift, else bodyweight defaults.
// Deliberately conservative (adult 90%, teen 75% of calculated) so week 1 is crisp.
function startingLoad(p, exId, lift, reps) {
  const best = (p.lifts || {})[lift] || {};
  const match = BARBELL_MATCH[lift].includes(exId) && best.weight && best.reps;
  if (p.type === "adult") {
    if (match) return roundLoad(weightForReps(e1rm(best.weight, best.reps), reps) * 0.9, 5, 45);
    return roundLoad(p.bodyweight * ADULT_DEFAULTS[p.experience][lift] * ((1 + 8 / 30) / (1 + reps / 30)), 5, 45);
  }
  if (match) return roundLoad(weightForReps(e1rm(best.weight, best.reps), reps) * 0.75, 5, 45);
  const d = TEEN_DEFAULTS[exId];
  return d ? roundLoad(p.bodyweight * d[p.experience], 5, d.min) : 0;
}

// ───────────── rep schemes & item builders ─────────────

function coreScheme(p, lift) {
  if (p.type === "teen") {
    if (lift === "clean") return { sets: 4, min: 3, max: 5, rest: 120 };
    return p.experience === "beginner" ? { sets: 3, min: 8, max: 12, rest: 120 } : { sets: 3, min: 6, max: 10, rest: 150 };
  }
  if (lift === "clean") return { sets: 5, min: 2, max: 4, rest: 120 };
  if (lift === "deadlift") return p.goal === "balanced" ? { sets: 3, min: 5, max: 8, rest: 180 } : { sets: 3, min: 4, max: 6, rest: 180 };
  if (p.goal === "balanced") return { sets: 3, min: 6, max: 10, rest: 150 };
  return { sets: 4, min: 5, max: 8, rest: 180 };
}
const accScheme = p => (p.type === "teen" ? { sets: 2, min: 10, max: 15, rest: 60 } : { sets: 3, min: 8, max: 12, rest: 75 });

function rampNote(p, exId) {
  if (p.type === "teen") return "Ramp up: 1–2 light sets of 5 before your work sets.";
  if (EX[exId].per_hand) return "Ramp up: 1 light set before your work sets.";
  return "Ramp up: empty bar ×10, ~50% ×5, ~70% ×3, ~85% ×1, then work sets.";
}
function core(p, exId, lift, extra = "") {
  const sc = coreScheme(p, lift), load = startingLoad(p, exId, lift, sc.max - 2), ex = EX[exId];
  const teenNote = p.type === "teen" ? "Every rep should look the same. Rate form honestly — weight only goes up when form is 4+." : "";
  const loadNote = load === 0 ? "Use a PVC pipe or empty bar until the movement is smooth." : rampNote(p, exId);
  return { exercise_id: exId, block: ex.category === "Power" ? "power" : "strength", sets: sc.sets, rep_min: sc.min, rep_max: sc.max,
    rest_sec: sc.rest, load_lb: load || undefined, progression: "double", notes: [loadNote, extra, teenNote].filter(Boolean).join(" ") };
}
const secondary = (exId, sets, min, max, rest, notes) =>
  ({ exercise_id: exId, block: "strength", sets, rep_min: min, rep_max: max, rest_sec: rest, progression: "double", notes: notes || "About 2 reps in reserve on every set." });
function acc(p, exId, o = {}) {
  const sc = accScheme(p), lb = EX[exId].measure === "lb";
  return Object.assign({ exercise_id: exId, block: "accessory", sets: sc.sets, rep_min: sc.min, rep_max: sc.max, rest_sec: sc.rest,
    progression: lb ? "double" : "none", notes: lb ? "Pick a weight you could do for 2 more reps than the top of the range." : "" }, o);
}
const hold = (exId, sets, sec, rest = 45, notes = "") =>
  ({ exercise_id: exId, block: "accessory", sets, rep_min: 1, rep_max: 1, time_sec: sec, rest_sec: rest, progression: "none", notes });
const drill = (exId, block, sets, reps, rest, notes = "", distance) =>
  ({ exercise_id: exId, block, sets, rep_min: reps, rep_max: reps, rest_sec: rest, progression: "none", notes, distance });
const warmup = () => ({ exercise_id: "dynamic_warmup", block: "warmup", sets: 1, rep_min: 1, rep_max: 1, time_sec: 480, rest_sec: 0, progression: "none", notes: "Easy jog 2 min, then the movement list." });
const cooldown = () => ({ exercise_id: "mobility_flow", block: "mobility", sets: 1, rep_min: 1, rep_max: 1, time_sec: 300, rest_sec: 0, progression: "none", notes: "5 minutes. Slow breathing." });

// ───────────── day templates ─────────────

function adultDays(p) {
  const sp = p.goal === "sports";
  return {
    SQ: { day_id: "SQ", kind: "strength", core_lift: "squat", name: "Squat Day", focus: "Quads & legs · hinge + single-leg support", items: [
      warmup(),
      drill("sprint_10", "speed", sp ? 5 : 3, 1, 75, FULL_REST, "10 yd"),
      drill("box_jump", "power", 3, 3, 60, "Moderate box. Step down."),
      core(p, "back_squat", "squat"),
      secondary("romanian_deadlift", 3, 8, 10, 120, "Moderate — this supports the squat, it isn't a second heavy lift."),
      acc(p, "split_squat", { rep_min: 8, rep_max: 10, notes: "Reps per leg." }),
      hold("plank", 3, 40),
      cooldown()] },
    BP: { day_id: "BP", kind: "strength", core_lift: "bench", name: "Bench Day", focus: "Upper body · 2 pulls for every push", items: [
      warmup(),
      drill("ladder_drills", "speed", sp ? 4 : 3, 1, 45, "Different pattern each trip. Quick, light feet."),
      ...(sp ? [drill("pro_agility", "speed", 4, 1, 90, "Alternate start direction. Log best time.")] : []),
      drill("med_ball_chest_pass", "power", 3, 5, 45, "Explosive — primes the bench."),
      core(p, "bench_press", "bench", "Spotter or safeties set."),
      acc(p, "pull_up", { rep_min: 5, rep_max: 10, rest_sec: 90, notes: "Band if needed. Full hang to chest up." }),
      acc(p, "db_ohp", { rest_sec: 90 }),
      acc(p, "db_row", { notes: "Reps per arm." }),
      acc(p, "face_pull", { rep_min: 12, rep_max: 15, rest_sec: 45, notes: "Shoulder health — light and controlled." }),
      cooldown()] },
    CL: { day_id: "CL", kind: "strength", core_lift: "clean", name: "Clean Day", focus: "Explosive power · single-leg strength", items: [
      warmup(),
      drill("a_skip", "speed", 2, 1, 30, "20 yd each.", "20 yd"),
      ...(sp ? [drill("flying_20", "speed", 3, 1, 120, FULL_REST, "20 yd fly")] : []),
      drill("broad_jump", "power", 3, 3, 60, "Stick each landing. Log your best."),
      core(p, "power_clean", "clean", "Bar speed over load — if the catch gets slow or low, the weight is too heavy."),
      acc(p, "step_up", { rep_min: 8, rep_max: 10, rest_sec: 75, notes: "Reps per leg." }),
      acc(p, "inverted_row", { rep_min: 8, rep_max: 12 }),
      drill("med_ball_rot", "power", 3, 5, 45, "Reps per side."),
      hold("side_plank", 2, 30, 30, "Time per side."),
      cooldown()] },
    DL: { day_id: "DL", kind: "strength", core_lift: "deadlift", name: "Deadlift Day", focus: "Posterior chain · glutes, hamstrings, grip", items: [
      warmup(),
      drill("lateral_shuffle", "speed", 3, 1, 45, "10 yd down and back."),
      ...(sp ? [drill("l_drill", "speed", 3, 1, 90, "Log best time.")] : []),
      drill("med_ball_scoop", "power", 3, 4, 45, "Hips explode forward — primes the pull."),
      core(p, "deadlift", "deadlift", "Reset each rep — no bouncing off the floor."),
      acc(p, "hip_thrust", { rep_min: 8, rep_max: 12, rest_sec: 90 }),
      acc(p, "nordic_curl", { rep_min: 4, rep_max: 6, rest_sec: 90, notes: "Slow lowering; band-assist as needed." }),
      acc(p, "pallof_press", { rep_min: 10, rep_max: 12, rest_sec: 45, notes: "Reps per side." }),
      hold("farmer_carry", 3, 40, 60, "Heavy. 40-sec walks."),
      cooldown()] },
    ATH: { day_id: "ATH", kind: "speed", name: "Athletic Day", focus: "Sprints, agility, jumps — no heavy lifting", items: [
      warmup(),
      drill("a_skip", "speed", 2, 1, 30, "20 yd each.", "20 yd"),
      drill("sprint_10", "speed", 5, 1, 75, FULL_REST, "10 yd"),
      drill("pro_agility", "speed", 4, 1, 90, "Log best time."),
      drill("l_drill", "speed", 3, 1, 90, "Log best time."),
      drill("lateral_bound", "power", 3, 4, 60, "Reps per side."),
      hold("side_plank", 2, 30, 30, "Time per side."),
      cooldown()] },
  };
}

function teenDays(p) {
  const beg = p.experience === "beginner";
  const sq = beg ? "goblet_squat" : "back_squat", bp = beg ? "db_bench_press" : "bench_press", cl = beg ? "hang_clean_pull" : "hang_power_clean";
  return {
    SQ: { day_id: "SQ", kind: "strength", core_lift: "squat", name: "Squat Day", focus: "Acceleration, jumps, squat technique", items: [
      warmup(),
      drill("a_skip", "speed", 2, 1, 30, "20 yd each.", "20 yd"),
      drill("sprint_10", "speed", 4, 1, 90, FULL_REST, "10 yd"),
      drill("box_jump", "power", 3, 3, 60, "Low-moderate box. Land quiet. Step down."),
      core(p, sq, "squat"),
      acc(p, "walking_lunge", { rep_min: 8, rep_max: 8, notes: "Bodyweight. Reps per leg." }),
      acc(p, "inverted_row", { rep_min: 8, rep_max: 12 }),
      hold("plank", 2, 30),
      cooldown()] },
    BP: { day_id: "BP", kind: "strength", core_lift: "bench", name: "Bench Day", focus: "Footwork, jumps, press technique + pulling", items: [
      warmup(),
      drill("ladder_drills", "speed", 4, 1, 45, "4 different patterns."),
      drill("vertical_jump", "power", 3, 2, 60, "Log your best jump."),
      drill("med_ball_chest_pass", "power", 3, 5, 45),
      core(p, bp, "bench", bp === "bench_press" ? "Always with a spotter." : "Per-hand weight."),
      acc(p, "pull_up", { rep_min: 3, rep_max: 8, notes: "Band-assisted is fine." }),
      acc(p, "db_ohp", { rep_min: 10, rep_max: 12, notes: "Light — strict form." }),
      acc(p, "face_pull", { rep_min: 12, rep_max: 15, rest_sec: 45 }),
      hold("side_plank", 2, 20, 30, "Time per side."),
      cooldown()] },
    CL: { day_id: "CL", kind: "strength", core_lift: "clean", name: "Clean Day", focus: "Sprints, jumps, clean technique", items: [
      warmup(),
      drill("sprint_10", "speed", 4, 1, 90, FULL_REST, "10 yd"),
      drill("broad_jump", "power", 3, 3, 60, "Stick each landing. Log your best."),
      core(p, cl, "clean", beg ? "Technique day: learn the jump-and-shrug before ever catching the bar." : "Fast and crisp — stop the set if the catch gets sloppy."),
      acc(p, "split_squat", { rep_min: 8, rep_max: 10, notes: "Bodyweight to start; add light dumbbells once 10 per leg is easy. Reps per leg." }),
      acc(p, "push_up", { rep_min: 8, rep_max: 15 }),
      acc(p, "pallof_press", { rep_min: 10, rep_max: 10, rest_sec: 30, notes: "Reps per side." }),
      cooldown()] },
    DL: { day_id: "DL", kind: "strength", core_lift: "deadlift", name: "Deadlift Day", focus: "Agility, hinge technique, single-leg, back", items: [
      warmup(),
      drill("pro_agility", "speed", 4, 1, 90, "Alternate directions. Log best time."),
      drill("lateral_bound", "power", 3, 3, 60, "Stick each landing. Reps per side."),
      drill("med_ball_scoop", "power", 3, 4, 45),
      core(p, "trap_bar_deadlift", "deadlift", "Reset each rep — no bouncing."),
      acc(p, "step_up", { rep_min: 8, rep_max: 10, notes: "Light dumbbells. Reps per leg." }),
      acc(p, "db_row", { notes: "Reps per arm." }),
      hold("side_plank", 2, 20, 30, "Time per side."),
      cooldown()] },
    ATH: { day_id: "ATH", kind: "speed", name: "Athletic Day", focus: "Speed, agility, reaction — no lifting", items: [
      warmup(),
      drill("wall_drill", "speed", 3, 10, 45, "10 switches."),
      drill("sprint_10", "speed", 5, 1, 90, FULL_REST, "10 yd"),
      drill("flying_20", "speed", 3, 1, 120, FULL_REST, "20 yd fly"),
      drill("l_drill", "speed", 3, 1, 90, "Log best time."),
      drill("reaction_drop", "speed", 6, 1, 45),
      drill("box_jump", "power", 3, 3, 60, "Land quiet. Step down."),
      cooldown()] },
  };
}

// ───────────── weekly schedule ─────────────

const S = weekday => ({ weekday, kind: "strength" }), P = weekday => ({ weekday, kind: "speed" });

function chooseSchedule(p, rules) {
  const days = Math.min(Math.max(+p.days_per_week || 3, 2), 5);
  if (p.days_per_week > 5) rules.push(`Capped at 5 training days (you asked for ${p.days_per_week}) to keep two full rest days.`);
  // Teen 4-day uses Sat so clean (Thu) and deadlift (Sat) — both lower-body pulls — aren't back to back.
  const map = p.type === "adult"
    ? { 2: [S("Mon"), S("Thu")], 3: [S("Mon"), S("Wed"), S("Fri")], 4: [S("Mon"), S("Tue"), S("Thu"), S("Fri")], 5: [S("Mon"), S("Tue"), P("Wed"), S("Thu"), S("Fri")] }
    : { 2: [S("Mon"), S("Thu")], 3: [S("Mon"), S("Wed"), S("Fri")], 4: [S("Mon"), S("Tue"), S("Thu"), S("Sat")], 5: [S("Mon"), S("Tue"), P("Wed"), S("Thu"), S("Sat")] };
  const sched = map[days];
  if (days >= 4) {
    const w = k => sched.filter(x => x.kind === "strength")[k].weekday;
    rules.push(`Week: ${w(0)} Squat · ${w(1)} Bench · ${w(2)} Clean · ${w(3)} Deadlift${days === 5 ? " · Wed Athletic Day (no heavy lifting)" : ""}. Clean comes before deadlift so it's trained fresh.`);
  } else {
    rules.push(`${days} lifting days a week, rotating Squat → Bench → Clean → Deadlift. Each lift gets its own day; a full cycle takes ${days === 3 ? "about 9 days" : "2 weeks"}.`);
  }
  if (days === 2) rules.push("With 2 days, each lift comes around every 2 weeks. 3–4 days is better for steady strength gains.");
  rules.push("Every lifting day opens with sprints, agility or ladder work plus jumps or throws, done fresh before the lift.");
  if (p.type === "teen") rules.push("Rest days built in: at least 2 full rest days a week, and never two lower-body lifting days in a row.");
  return sched;
}

// ───────────── time fitting & volume ─────────────

const itemSeconds = d => d.sets * (d.time_sec || (d.block === "speed" ? 10 : d.rep_max * 4 + 10)) + Math.max(d.sets - 1, 0) * d.rest_sec + 30;
const estMinutes = items => Math.round(items.reduce((t, d) => t + itemSeconds(d), 0) / 60);
function findLast(xs, f) { for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return i; return -1; }

function fitToSession(p, def, notes) {
  const items = def.items.map(d => Object.assign({}, d));
  const limit = +p.session_length || 60;
  if (p.type === "teen") {
    const work = xs => xs.filter(d => d.block === "strength" || d.block === "accessory" || d.progression === "double").reduce((n, d) => n + d.sets, 0);
    while (work(items) > TEEN_MAX_WORK_SETS) {
      const i = findLast(items, d => d.block === "accessory" && d.sets > 1);
      if (i < 0) break;
      items[i].sets--;
    }
    notes.add(`Soft volume cap: ${TEEN_MAX_WORK_SETS} lifting sets per session (jumps and sprints are dosed separately).`);
  }
  while (estMinutes(items) > limit) {
    const i = findLast(items, d => d.block === "accessory");
    if (i >= 0) { items.splice(i, 1); notes.add(`Some accessories removed to fit ${limit}-minute sessions.`); continue; }
    const c = findLast(items, d => (d.block === "strength" || d.block === "power") && d.sets > 2);
    if (c < 0) break;
    items[c].sets--; notes.add(`Some sets reduced to fit ${limit}-minute sessions.`);
  }
  if (p.type === "adult" && limit >= 75) {
    const i = items.findIndex(d => d.block === "accessory" && d.progression === "double");
    if (i >= 0 && estMinutes(items) + 3 <= limit) items[i].sets++;
  }
  return items;
}

// ───────────── generate ─────────────

function generatePlan(p, id) {
  const rules = ["One core lift per session — squat, bench, clean and deadlift each get their own day."];
  const schedule = chooseSchedule(p, rules);
  const defs = p.type === "adult" ? adultDays(p) : teenDays(p);
  const fit = new Set();
  const lifts = schedule.filter(s => s.kind === "strength"), speed = schedule.filter(s => s.kind === "speed");
  const fixed = lifts.length === CORE_LIFTS.length;
  const order = CORE_LIFTS.map(l => LIFT_DAY[l]).concat(speed.length ? ["ATH"] : []);
  const days = order.map(k => {
    const def = defs[k];
    const items = fitToSession(p, def, fit).map((d, i) => Object.assign(d, { order: i + 1 }));
    let weekday = "";
    if (def.kind === "strength" && fixed) weekday = lifts[CORE_LIFTS.indexOf(def.core_lift)].weekday;
    if (def.kind === "speed") weekday = speed[0].weekday;
    return { day_id: def.day_id, kind: def.kind, core_lift: def.core_lift, name: def.name, focus: def.focus, suggested_weekday: weekday, est_minutes: estMinutes(items), items };
  });
  if (p.type === "adult") {
    rules.push("Double progression: when every work set hits the top of the rep range with good form (RPE ≤ 9), add 5 lb (2.5 lb on bench once it passes 185) and build the reps back up.");
    rules.push("Miss the bottom of the range twice in a row → drop 10% and build back up.");
  } else {
    rules.push("Form gate: weight only goes up after TWO sessions in a row where every set hits the top of the range with form rated 4 or 5.");
    rules.push("Small jumps: +5 lb lower body, +2.5 lb upper body (dumbbells: next size up).");
    rules.push("Any set rated form 1–2 → weight drops 10% next time. Technique first, always.");
    rules.push("Never test a max. Progress is tracked with best sets and sprint/jump times.");
    if (p.form_focus_mode) rules.push("Form-focus mode ON: form rating required on every lift; cues shown before each exercise.");
  }
  fit.forEach(r => rules.push(r));
  return {
    id, profile_id: p.id, created: Date.now(), active: true,
    name: `${p.name}'s ${schedule.length}-Day ${p.type === "teen" ? "Athlete" : "Strength"} Plan`,
    description: `${schedule.length} days/week · ${lifts.length} lifting${speed.length ? " + 1 athletic" : ""} · ${p.goal === "sports" ? "sports-performance" : p.goal} focus · ~${p.session_length} min`,
    days, schedule, rules,
  };
}

// Next workout: the slot type comes from how many sessions are done on this plan; within that type,
// days rotate in order after the last one completed. `sessions` is newest first.
function nextDay(plan, sessions) {
  const done = sessions.filter(s => s.plan_id === plan.id);
  const kind = plan.schedule[done.length % plan.schedule.length].kind;
  const q = plan.days.filter(d => d.kind === kind);
  if (!q.length) return plan.days[0];
  const last = done.find(s => q.some(d => d.day_id === s.day_id));
  return q[((last ? q.findIndex(d => d.day_id === last.day_id) : -1) + 1) % q.length];
}

// ───────────── double progression ─────────────

// One exercise's history grouped into sessions, newest first.
function historySessions(sets) {
  const by = {};
  sets.forEach(s => (by[s.session_id] = by[s.session_id] || []).push(s));
  return Object.values(by).map(xs => xs.sort((a, b) => a.set_number - b.set_number))
    .sort((a, b) => (b[0].date + b[0].session_id).localeCompare(a[0].date + a[0].session_id));
}
const reduceLoad = (w, step) => { const r = Math.floor((w * 0.9) / step) * step; return Math.max(step, r < w ? r : w - step); };
function jumpFor(p, ex, w) {
  if (ex.per_hand) return 5;
  if (p.type === "teen") return ex.lower_body ? 5 : 2.5;
  return ex.lower_body ? 5 : w >= 185 ? 2.5 : 5;
}
function judge(p, item, sets) {
  const weight = Math.max(...sets.map(s => +s.weight || 0));
  const work = sets.filter(s => (+s.weight || 0) === weight);
  const forms = sets.map(s => s.form);
  return {
    weight,
    topHit: work.length >= item.sets && work.every(s => s.reps >= item.rep_max),
    missedBottom: work.some(s => s.reps < item.rep_min),
    poorForm: forms.some(f => f && f <= 2),
    formOk: p.type === "teen" ? forms.every(f => f >= 4) : forms.every(f => !f || f >= 3) && sets.every(s => !s.rpe || s.rpe <= 9),
  };
}

// → { weight, reps[], kind: start|increase|hold|form-hold|reduce, reason }
function suggest(p, item, ex, history) {
  const all = n => Array.from({ length: item.sets }, () => n);
  const hs = historySessions(history), last = hs[0];
  if (!last) return { weight: item.load_lb || 0, reps: all(item.rep_min), kind: "start",
    reason: item.load_lb ? `Starting weight from your profile. Aim for ${item.rep_min}–${item.rep_max} clean reps.`
      : ex.measure === "lb" ? "First time: pick a weight you could do for 2 more reps than the top of the range." : "First time — log what you do today." };
  if (item.progression === "none") return { weight: +last[0].weight || 0, reps: all(item.rep_max), kind: "hold", reason: "Match or beat last time." };
  const v = judge(p, item, last), inc = jumpFor(p, ex, v.weight);
  const work = last.filter(s => (+s.weight || 0) === v.weight);
  const next = Array.from({ length: item.sets }, (_, i) => Math.min(item.rep_max, Math.max(item.rep_min, ((work[i] || {}).reps || item.rep_min) + 1)));
  if (v.poorForm) return p.type === "teen"
    ? { weight: reduceLoad(v.weight, 5), reps: all(item.rep_min), kind: "reduce", reason: "Form was rated low last time — lighter today to groove clean reps." }
    : { weight: v.weight, reps: next, kind: "form-hold", reason: "Form slipped last time — same weight, own every rep." };
  if (v.topHit && v.formOk) {
    if (p.type === "teen") {
      const pv = hs[1] && judge(p, item, hs[1]);
      if (!(pv && pv.weight === v.weight && pv.topHit && pv.formOk))
        return { weight: v.weight, reps: all(item.rep_max), kind: "form-hold", reason: `Great session! Do it once more with form 4–5 on every set to unlock +${inc} lb.` };
    }
    return { weight: v.weight + inc, reps: all(item.rep_min), kind: "increase", reason: `You hit ${item.rep_max} on every set — add ${inc} lb${ex.per_hand ? " per hand" : ""} and build reps back up.` };
  }
  if (v.topHit) return { weight: v.weight, reps: all(item.rep_max), kind: "form-hold",
    reason: p.type === "teen" ? "Reps are there — rate form 4+ on every set to unlock more weight." : "Reps are there but it was a grind (RPE 10 or low form). Repeat and make it smoother." };
  if (v.missedBottom && hs[1]) {
    const pv = judge(p, item, hs[1]);
    if (pv.weight === v.weight && pv.missedBottom) return { weight: reduceLoad(v.weight, 5), reps: all(item.rep_min), kind: "reduce", reason: "Missed the bottom of the range twice — drop 10% and build back up." };
  }
  return { weight: v.weight, reps: next, kind: "hold", reason: "Same weight — beat last time by a rep per set." };
}

// ───────────── XP, levels, streaks, badges ─────────────

const XP = { session: 100, goodFormSet: 5, pr: 50, metricPr: 40, streakPer: 5, streakCap: 50 };
const levelFor = xp => Math.floor(Math.sqrt(xp / 150)) + 1;
const xpForLevel = l => 150 * (l - 1) * (l - 1);
const STREAK_GAP = 3; // rest days are part of training: up to 3 days between sessions keeps the streak

const dayNum = d => Math.round(new Date(d + "T00:00:00Z").getTime() / 864e5);
function nextStreak(prog, date) {
  if (!prog.last_date) return { streak: 1, freeze: false };
  const gap = dayNum(date) - dayNum(prog.last_date);
  if (gap <= 0) return { streak: Math.max(prog.streak, 1), freeze: false };
  if (gap <= STREAK_GAP) return { streak: prog.streak + 1, freeze: false };
  if (gap <= STREAK_GAP + 4 && prog.freeze_month !== date.slice(0, 7)) return { streak: prog.streak + 1, freeze: true }; // 1 free freeze a month
  return { streak: 1, freeze: false };
}
const freezeReady = (prog, date) => prog.freeze_month !== date.slice(0, 7);

const BADGES = [
  { id: "first_session", name: "First Rep", emoji: "🔥", desc: "Logged your first workout" },
  { id: "streak_5", name: "On a Roll", emoji: "⚡", desc: "5-session streak" },
  { id: "streak_15", name: "Iron Habit", emoji: "🧱", desc: "15-session streak" },
  { id: "sessions_10", name: "Ten Down", emoji: "🔟", desc: "10 workouts logged" },
  { id: "sessions_50", name: "Forged", emoji: "⚒️", desc: "50 workouts logged" },
  { id: "full_cycle", name: "Full Cycle", emoji: "🔄", desc: "Trained all four lifts" },
  { id: "max_effort", name: "Max Effort", emoji: "💯", desc: "Teen only: finished every exercise with every lift rated form 4–5" },
  { id: "first_pr", name: "PR Hunter", emoji: "🏆", desc: "Set your first personal record" },
  { id: "form_master", name: "Form Master", emoji: "🎯", desc: "Every set rated form 4–5 in a session" },
  { id: "speed_pr", name: "Wheels", emoji: "💨", desc: "Beat a sprint or agility time" },
  { id: "jump_pr", name: "Hops", emoji: "🦘", desc: "Beat a jump distance" },
  { id: "family_day", name: "Family Grind", emoji: "🤝", desc: "You both trained on the same day" },
  { id: "challenge_month", name: "Month Conquered", emoji: "🏅", desc: "Finished all three monthly challenges" },
];
const BADGE = Object.fromEntries(BADGES.map(b => [b.id, b]));

/**
 * Score a finished workout against history. Pure: returns everything to save.
 * a = { profile, progress, date, sets (this session), history (all prior sets), metricsHistory,
 *       sessionsMine (prior), familyToday (bool), allDone (every exercise finished, not skipped) }
 */
function scoreWorkout(a) {
  const prs = [], best = Object.assign({}, a.progress.best || {});
  const by = {};
  a.sets.forEach(s => (by[s.exercise_id] = by[s.exercise_id] || []).push(s));
  let liftPrs = 0, speedPr = false, jumpPr = false;
  const metrics = [];
  Object.keys(by).forEach(id => {
    const ex = EX[id], xs = by[id];
    if (!ex) return;
    if (ex.measure === "lb") {
      const top = xs.reduce((m, s) => (e1rm(s.weight, s.reps) > e1rm(m.weight, m.reps) ? s : m));
      const prior = a.history.filter(h => h.exercise_id === id);
      const priorBest = Math.max(0, ...prior.map(h => e1rm(h.weight, h.reps)));
      const topE = e1rm(top.weight, top.reps);
      if (prior.length && topE > priorBest) { top.is_pr = true; liftPrs++; prs.push(`${ex.name}: ${top.weight} × ${top.reps}`); }
      if (ex.core_lift && topE > (best[ex.core_lift] || 0)) best[ex.core_lift] = topE;
    }
    if (ex.metric_name) {
      const rs = xs.map(s => +s.result).filter(r => r > 0);
      if (!rs.length) return;
      const unit = ex.measure === "in" ? "in" : "sec";
      const b = unit === "sec" ? Math.min(...rs) : Math.max(...rs);
      const prior = a.metricsHistory.filter(m => m.drill === ex.metric_name).map(m => +m.value);
      if (prior.length && (unit === "sec" ? b < Math.min(...prior) : b > Math.max(...prior))) {
        prs.push(`${ex.metric_name}: ${b}${unit === "sec" ? "s" : '"'}`);
        if (unit === "sec") speedPr = true; else jumpPr = true;
        const s = xs.find(x => +x.result === b); if (s) s.is_pr = true;
      }
      metrics.push({ drill: ex.metric_name, value: b, unit });
    }
  });
  const st = nextStreak(a.progress, a.date);
  const goodForm = a.sets.filter(s => s.form >= 4).length;
  const xp = XP.session + goodForm * XP.goodFormSet + liftPrs * XP.pr + ((speedPr ? 1 : 0) + (jumpPr ? 1 : 0)) * XP.metricPr + Math.min(st.streak * XP.streakPer, XP.streakCap);
  const total = (a.progress.xp || 0) + xp, level = levelFor(total);
  const progress = Object.assign({}, a.progress, {
    xp: total, level, streak: st.streak, longest: Math.max(a.progress.longest || 0, st.streak), last_date: a.date,
    freeze_month: st.freeze ? a.date.slice(0, 7) : a.progress.freeze_month || "", best,
  });
  // badges
  const have = new Set(a.progress.badges || []), earned = [];
  const add = (id, c) => { if (c && !have.has(id)) earned.push(id); };
  const rated = a.sets.filter(s => s.form);
  const liftsDone = new Set(a.sessionsMine.map(s => s.day_id).concat([a.day_id]));
  add("first_session", true);
  add("streak_5", st.streak >= 5); add("streak_15", st.streak >= 15);
  add("sessions_10", a.sessionsMine.length + 1 >= 10); add("sessions_50", a.sessionsMine.length + 1 >= 50);
  add("full_cycle", ["SQ", "BP", "CL", "DL"].every(d => liftsDone.has(d)));
  add("first_pr", liftPrs > 0);
  add("form_master", rated.length >= 6 && rated.every(s => s.form >= 4));
  add("max_effort", a.profile.type === "teen" && a.allDone && rated.length >= 6 && rated.every(s => s.form >= 4));
  add("speed_pr", speedPr); add("jump_pr", jumpPr); add("family_day", a.familyToday);
  progress.badges = [...(a.progress.badges || []), ...earned];
  return { xp, progress, prs, metrics, badges: earned, leveled: level > (a.progress.level || 1), streak: st.streak, freeze: st.freeze };
}

if (typeof module !== "undefined") module.exports = { generatePlan, nextDay, suggest, scoreWorkout, estMinutes, e1rm, levelFor, xpForLevel, CORE_LIFTS };
