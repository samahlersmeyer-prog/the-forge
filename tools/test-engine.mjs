// Checks the plan engine: node tools/test-engine.mjs   (stamp.py runs it and refuses to ship if it fails)
// • no day ever has two core lifts • every lifting day opens with speed/jump work • sessions fit their time
// • the rotation reaches all four lifts • teens never get adult-only lifts • progression rules behave
import fs from "fs"; import vm from "vm";
const ctx = {}; vm.createContext(ctx);
vm.runInContext(["js/data.js", "js/howto.js", "js/engine.js"].map(f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")).join("\n") + "\n;globalThis.__x={HOW,EX,generatePlan,nextDay,suggest,scoreWorkout};", ctx);
const { HOW, EX, generatePlan, nextDay, suggest, scoreWorkout } = ctx.__x;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log("✗ " + m); } };
const pattern = id => EX[id] && EX[id].core_lift && ["back_squat","deadlift","bench_press","power_clean","goblet_squat","trap_bar_deadlift","db_bench_press","hang_clean_pull","hang_power_clean"].includes(id) ? EX[id].core_lift : null;
const blank = { squat: {}, bench: {}, clean: {}, deadlift: {} };
let n = 0;
for (const id in EX) ok(HOW[id] && HOW[id].what && HOW[id].setup && HOW[id].steps.length >= 3 && HOW[id].demo, "no How-to-do-it for " + id);
for (const id in HOW) ok(EX[id], "How-to-do-it for unknown exercise " + id);
for (const type of ["adult", "teen"]) for (const d of [2, 3, 4, 5]) for (const goal of ["strength", "sports", "balanced"]) for (const len of [45, 60, 90]) for (const experience of ["beginner", "intermediate"]) {
  n++;
  const p = { id: "p", name: "X", type, age: type === "teen" ? 13 : 40, bodyweight: type === "teen" ? 115 : 200, experience, goal, days_per_week: d, session_length: len, form_focus_mode: type === "teen", lifts: blank };
  const plan = generatePlan(p, "plan");
  for (const day of plan.days) {
    const pats = day.items.map(i => pattern(i.exercise_id)).filter(Boolean);
    ok(new Set(pats).size <= 1, `${type} ${d}d ${goal}: ${day.name} has ${pats}`);
    ok(day.kind === "speed" || pats.length === 1, `${type} ${day.name} missing its core lift`);
    ok(day.kind === "speed" || day.items.some(i => i.block === "speed") , `${type} ${day.name} has no speed/agility opener`);
    ok(day.est_minutes <= len + 2, `${type} ${len}m ${day.name} ~${day.est_minutes} min`);
    day.items.forEach(i => ok(EX[i.exercise_id], "missing exercise " + i.exercise_id));
    if (type === "teen") ok(!day.items.some(i => ["deadlift", "power_clean"].includes(i.exercise_id)), "teen got adult-only lift");
  }
  const ss = [], seen = new Set();
  for (let k = 0; k < plan.schedule.length * 4; k++) { const x = nextDay(plan, ss); seen.add(x.day_id); ss.unshift({ plan_id: "plan", day_id: x.day_id }); }
  ["SQ", "BP", "CL", "DL"].forEach(id => ok(seen.has(id), `${type} ${d}d never reaches ${id}`));
}
// progression
const teen = { type: "teen" }, adult = { type: "adult" };
const item = { sets: 3, rep_min: 8, rep_max: 12, load_lb: 20, progression: "double" };
const mk = (sid, date, reps, form, w = 20, ex = "goblet_squat") => reps.map((r, i) => ({ session_id: sid, date, exercise_id: ex, set_number: i + 1, weight: w, reps: r, form }));
ok(suggest(teen, item, EX.goblet_squat, []).kind === "start", "teen start");
ok(suggest(teen, item, EX.goblet_squat, mk("a", "2026-11-01", [12, 12, 12], 5)).kind === "form-hold", "teen needs 2 sessions");
ok(suggest(teen, item, EX.goblet_squat, [...mk("a", "2026-11-01", [12, 12, 12], 5), ...mk("b", "2026-11-03", [12, 12, 12], 4)]).weight === 25, "teen increase after 2");
ok(suggest(teen, item, EX.goblet_squat, mk("a", "2026-11-01", [10, 9, 8], 2)).weight === 15, "teen poor form drops");
const ai = { sets: 3, rep_min: 6, rep_max: 10, progression: "double" };
ok(suggest(adult, ai, EX.back_squat, mk("a", "2026-11-01", [10, 10, 10], 4, 225, "back_squat")).weight === 230, "adult +5");
ok(suggest(adult, ai, EX.back_squat, [...mk("a", "2026-11-01", [6, 5, 5], 4, 225, "back_squat"), ...mk("b", "2026-11-04", [6, 5, 4], 4, 225, "back_squat")]).weight === 200, "adult drop 10%");
// scoring
const r = scoreWorkout({ profile: adult, progress: { xp: 0, level: 1, streak: 0, badges: [] }, date: "2026-11-09", day_id: "SQ",
  sets: mk("c", "2026-11-09", [10, 10, 10], 5, 235, "back_squat"), history: mk("a", "2026-11-01", [10, 10, 10], 4, 225, "back_squat"), metricsHistory: [], sessionsMine: [], familyToday: false });
ok(r.prs.length === 1 && r.xp > 100 && r.progress.best.squat > 0, "scoring + PR");
console.log(bad ? `✗ ${bad} problems` : `engine OK: ${n} profile combos, one core lift per day, rotation reaches every lift`);
process.exit(bad ? 1 : 0);
