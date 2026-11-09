// core.js: config, local data + sync with the Sheet, server calls, toast/modal, celebrations, navigation.
// Local-first: everything is saved on the phone immediately and queued for the Sheet (outbox), so logging
// works in a weight room with no signal. The outbox sends itself whenever the phone is back online.

const APP_NAME = "The Forge";
const CFG = window.AF_CONFIG || {};
const SERVER = (CFG.scriptUrl || "").trim();
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = (p = "") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Indiana/Indianapolis" }).format(new Date());
const fmtRest = s => (s < 60 ? s + "s" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"));

// ---------- local storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

// ---------- local database (mirror of the Sheet) ----------
const TABS = ["Profiles", "Plans", "Sessions", "Sets", "Metrics", "Progress", "Recaps", "Coach"];
const JSON_FIELDS = ["lifts", "days", "schedule", "rules", "prs", "badges", "best", "coach_changes"];
const NUM_FIELDS = ["age", "bodyweight", "days_per_week", "session_length", "duration_min", "xp", "set_number", "weight", "reps", "rpe", "form", "result", "value", "level", "streak", "longest", "updated", "created", "ts"];
const BOOL_FIELDS = ["form_focus_mode", "active", "is_pr"];
let DB = store.get("af:db", null) || Object.fromEntries(TABS.map(t => [t, {}]));
TABS.forEach(t => { DB[t] = DB[t] || {}; });
const saveDB = () => store.set("af:db", DB);

function clean(row) {
  const r = Object.assign({}, row);
  JSON_FIELDS.forEach(k => { if (typeof r[k] === "string") { try { r[k] = r[k] ? JSON.parse(r[k]) : (k === "badges" || k === "prs" ? [] : null); } catch (e) { r[k] = k === "badges" ? r[k].split(",").filter(Boolean) : null; } } });
  NUM_FIELDS.forEach(k => { if (r[k] !== undefined && r[k] !== "" && r[k] !== null) r[k] = +r[k]; else if (r[k] === "") r[k] = undefined; });
  BOOL_FIELDS.forEach(k => { if (r[k] !== undefined) r[k] = r[k] === true || String(r[k]).toLowerCase() === "true"; });
  return r;
}
const rows = t => Object.values(DB[t]);

// Save rows locally right away and queue them for the Sheet.
function put(tab, list) {
  list = Array.isArray(list) ? list : [list];
  list.forEach(r => { DB[tab][r.id] = Object.assign({}, r, { updated: Date.now() }); });
  saveDB();
  const out = store.get("af:out", []);
  out.push({ tab, rows: list });
  store.set("af:out", out);
  flushSoon();
}

// ---------- server ----------
const pin = () => store.get("af:pin", "");
function api(fn, ...args) {
  if (!SERVER) return Promise.reject(new Error("local"));
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), fn === "coach" || fn === "recap" ? 60000 : 25000);
  return fetch(SERVER, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn, args, pin: pin() }), redirect: "follow", signal: ctl.signal })
    .then(r => r.json())
    .then(j => { clearTimeout(t); if (!j || !j.ok) throw new Error((j && j.error) || "offline"); return j.result; })
    .catch(e => { clearTimeout(t); throw e && e.name === "AbortError" ? new Error("offline") : e; });
}
const errText = e => {
  const m = (e && e.message) || "";
  if (m === "bad_pin") return "That PIN didn't work.";
  if (m === "no_pin") return "Set a Household PIN in the Sheet's Config tab first.";
  if (m === "no_key") return "Coach isn't switched on yet. Add the ANTHROPIC_API_KEY in Apps Script (see README).";
  if (m === "local") return "Coach needs the Google Sheet connection (see README).";
  if (m === "offline" || /fetch|network|load failed/i.test(m)) return "No connection right now — try again in a bit.";
  return m;
};

let flushing = null, flushT = null;
function flushSoon() { clearTimeout(flushT); flushT = setTimeout(() => flush().catch(() => {}), 400); }
function flush() {
  if (!SERVER || !pin()) return Promise.resolve();
  if (flushing) return flushing;
  const out = store.get("af:out", []);
  if (!out.length) return Promise.resolve();
  // merge queued ops by tab+id so a long offline workout sends one batch
  const merged = {};
  out.forEach(op => op.rows.forEach(r => { (merged[op.tab] = merged[op.tab] || {})[r.id] = Object.assign({}, (merged[op.tab] || {})[r.id], r); }));
  const ops = Object.keys(merged).map(tab => ({ tab, rows: Object.values(merged[tab]).map(r => { const x = Object.assign({}, r); delete x.updated; return x; }) }));
  flushing = api("save", ops).then(() => {
    const now = store.get("af:out", []);
    store.set("af:out", now.slice(out.length)); // keep anything queued while we were sending
    syncDot();
  }).finally(() => { flushing = null; });
  return flushing;
}
function sync() {
  if (!SERVER || !pin()) return Promise.resolve(false);
  return flush().then(() => api("sync", store.get("af:since", 0))).then(res => {
    const pending = new Set(store.get("af:out", []).flatMap(op => op.rows.map(r => op.tab + ":" + r.id)));
    let changed = false;
    Object.keys(res.tabs || {}).forEach(t => {
      if (!DB[t]) DB[t] = {};
      res.tabs[t].forEach(r => { if (!pending.has(t + ":" + r.id)) { DB[t][r.id] = clean(r); changed = true; } });
    });
    store.set("af:since", res.now - 5000);
    saveDB(); syncDot();
    return changed;
  });
}
function syncDot() { const n = store.get("af:out", []).length; document.body.classList.toggle("unsynced", n > 0); }
window.addEventListener("online", () => flush().catch(() => {}));
document.addEventListener("visibilitychange", () => { if (!document.hidden) sync().then(c => { if (c && typeof refresh === "function") refresh(); }).catch(() => {}); });

// ---------- data helpers ----------
let ME = store.get("af:me", null); // current profile id on this phone
const profiles = () => rows("Profiles").sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "adult" ? -1 : 1));
const profile = id => DB.Profiles[id || ME] || null;
const activePlan = pid => rows("Plans").filter(p => p.profile_id === pid && p.active).sort((a, b) => (b.created || 0) - (a.created || 0))[0] || null;
const sessionsOf = pid => rows("Sessions").filter(s => s.profile_id === pid).sort((a, b) => (b.date + b.updated).localeCompare(a.date + a.updated));
const setsOf = pid => rows("Sets").filter(s => s.profile_id === pid);
const metricsOf = pid => rows("Metrics").filter(m => m.profile_id === pid).sort((a, b) => a.date.localeCompare(b.date));
const progressOf = pid => Object.assign({ id: pid, xp: 0, level: 1, streak: 0, longest: 0, last_date: "", freeze_month: "", badges: [], best: {} }, DB.Progress[pid] || {});
const isTeen = p => p && p.type === "teen";
function mondayOf(d) { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); }

// ---------- toast, modal ----------
let toastT;
function toast(msg, ms = 1800) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }
let modalClose = null;
function openModal(html, onClose) { $("modal-body").innerHTML = html; $("modal").hidden = false; modalClose = onClose || null; }
function closeModal() { $("modal").hidden = true; const f = modalClose; modalClose = null; if (f) f(); }
$("modal-close").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });

// ---------- celebrations ----------
function confetti(n = 80) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div"); box.className = "confetti"; document.body.appendChild(box);
  const colors = ["#e8772e", "#2f86d6", "#3f9b4f", "#f2c230", "#d33a2c", "#8a5cd0"];
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "%"; p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.5 + "s"; p.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
    p.style.setProperty("--dx", Math.random() * 160 - 80 + "px"); p.style.setProperty("--r", Math.random() * 900 - 450 + "deg");
    box.appendChild(p);
  }
  const fun = ["🏋️", "💪", "🔥", "🏆", "⚡", "🥇"];
  for (let i = 0; i < n / 5; i++) {
    const d = document.createElement("span"); d.textContent = fun[i % fun.length];
    d.style.left = Math.random() * 94 + "%"; d.style.animationDelay = Math.random() * 0.8 + "s"; d.style.animationDuration = 2 + Math.random() * 1.4 + "s";
    d.style.setProperty("--dx", Math.random() * 80 - 40 + "px"); d.style.setProperty("--r", Math.random() * 120 - 60 + "deg");
    box.appendChild(d);
  }
  setTimeout(() => box.remove(), 4600);
}
let actx = null;
function chime(kind = "win") {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { win: [523, 659, 784, 1047], go: [880, 1175], tick: [660] }[kind] || [660];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.11;
      o.type = "triangle"; o.frequency.value = f; o.connect(g).connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
  } catch (e) {}
}
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

// ---------- navigation ----------
const VIEWS = ["who", "home", "plan", "coach", "progress", "profile", "workout"];
const TAB_VIEWS = ["home", "plan", "coach", "progress", "profile"];
let active = "who";
function show(name, arg) {
  active = name;
  VIEWS.forEach(v => ($("v-" + v).hidden = v !== name));
  $("tabs").hidden = !TAB_VIEWS.includes(name);
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  document.body.classList.toggle("teen-on", isTeen(profile()));
  const r = { home: renderHome, plan: renderPlan, coach: renderCoach, progress: renderProgress, profile: renderProfile, workout: renderWorkout }[name];
  if (r) r(arg);
}
function refresh() { if (active !== "workout" && active !== "who") show(active); }
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));

// Shared click handler: any element with data-act="name" calls ACTIONS.name(element, event).
const ACTIONS = {};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && ACTIONS[el.dataset.act]) { e.preventDefault(); ACTIONS[el.dataset.act](el, e); }
});
