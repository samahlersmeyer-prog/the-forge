// ===================== THE FORGE: SERVER =====================
// Lives in GitHub (server/Code.gs). The Apps Script project only holds server/Loader.gs, which pulls this
// file from GitHub, so pushing a new version goes live in about 10 minutes with no pasting or deploying.
//
// Storage: the Google Sheet the script is attached to. Tabs are created automatically on first use.
// Every row has an `id` and an `updated` time (ms); the app syncs by asking for rows updated since it last looked.
// Coach: calls Claude through the Anthropic API. The key lives in Script Properties as ANTHROPIC_API_KEY
// (Apps Script → Project Settings → Script properties), never in the Sheet or in GitHub.

const TZ = 'America/Indiana/Indianapolis';
const TABS = {
  Profiles: ['id', 'name', 'type', 'age', 'bodyweight', 'experience', 'lifts', 'days_per_week', 'session_length', 'goal', 'form_focus_mode', 'avatar', 'updated'],
  Plans: ['id', 'profile_id', 'name', 'description', 'active', 'created', 'days', 'schedule', 'rules', 'updated'],
  Sessions: ['id', 'profile_id', 'date', 'plan_id', 'day_id', 'day_name', 'duration_min', 'xp', 'prs', 'notes', 'parent_notes', 'recap', 'coach_changes', 'updated'],
  Sets: ['id', 'session_id', 'profile_id', 'date', 'exercise_id', 'set_number', 'weight', 'reps', 'rpe', 'form', 'result', 'is_pr', 'updated'],
  Metrics: ['id', 'profile_id', 'date', 'drill', 'value', 'unit', 'updated'],
  Progress: ['id', 'xp', 'level', 'streak', 'longest', 'last_date', 'freeze_month', 'badges', 'best', 'updated'],
  Recaps: ['id', 'week', 'text', 'updated'],
  Coach: ['id', 'profile_id', 'ts', 'mode', 'q', 'a', 'updated'],
};
const CONFIG_DEFAULTS = [
  ['Household PIN', '', 'Required. Everyone in the house types this once per phone.'],
  ['Coach model', 'claude-sonnet-5-5', 'Claude model for the coach and write-ups.'],
];

const SS_ = () => SpreadsheetApp.getActiveSpreadsheet();

// ---------- entry points ----------
function doGet() {
  return out_({ ok: true, app: 'The Forge', coach: !!apiKey_() });
}
function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  let res;
  try {
    const fn = API_FNS[req.fn];
    if (!fn) throw new Error('Unknown call.');
    checkPin_(req.pin);
    res = { ok: true, result: fn.apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    res = { ok: false, error: String((err && err.message) || err).replace(/^Exception:\s*/, '') };
  }
  return out_(res);
}
const out_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// ---------- config & PIN ----------
function config_() {
  let sh = SS_().getSheetByName('Config');
  if (!sh) {
    sh = SS_().insertSheet('Config');
    sh.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]).setFontWeight('bold');
    sh.getRange(2, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
    sh.setFrozenRows(1); sh.autoResizeColumns(1, 3);
  }
  const c = {};
  sh.getDataRange().getValues().forEach(r => { if (r[0] !== '') c[String(r[0]).trim()] = String(r[1]).trim(); });
  return c;
}
function checkPin_(pin) {
  const want = config_()['Household PIN'];
  if (!want) throw new Error('no_pin');
  if (String(pin || '').trim() !== want) throw new Error('bad_pin');
}
const apiKey_ = () => PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');

// ---------- tabs ----------
function tab_(name) {
  let sh = SS_().getSheetByName(name);
  if (!sh) {
    sh = SS_().insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function head_(sh) { return sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : []; }
function readTab_(name) {
  const sh = tab_(name), v = sh.getDataRange().getValues(), head = (v.shift() || []).map(String);
  return v.filter(r => r[0] !== '').map(r => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], TZ, 'yyyy-MM-dd') : r[i]; });
    return o;
  });
}
const cell_ = v => (v === undefined || v === null) ? '' : (typeof v === 'object') ? JSON.stringify(v) : v;

// Upsert rows by id. New fields become new columns. Server stamps `updated` so sync stays in order.
function upsert_(name, rows, now) {
  if (!rows || !rows.length) return;
  const sh = tab_(name);
  let head = head_(sh);
  const extra = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (head.indexOf(k) < 0 && extra.indexOf(k) < 0) extra.push(k); }));
  if (extra.length) { sh.getRange(1, head.length + 1, 1, extra.length).setValues([extra]).setFontWeight('bold'); head = head.concat(extra); }
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  const appends = [];
  rows.forEach(r => {
    r = Object.assign({}, r, { updated: now });
    const at = ids.indexOf(String(r.id));
    if (at >= 0) {
      const range = sh.getRange(at + 2, 1, 1, head.length), cur = range.getValues()[0];
      range.setValues([head.map((h, i) => (h in r) ? cell_(r[h]) : cur[i])]);
    } else {
      appends.push(head.map(h => cell_(r[h])));
      ids.push(String(r.id));
    }
  });
  if (appends.length) {
    const start = sh.getLastRow() + 1;
    // keep ids and dates as plain text so the Sheet doesn't reformat them
    sh.getRange(start, 1, appends.length, head.length).setNumberFormat('@').setValues(appends.map(r => r.map(String)));
    numericCols_(sh, head, start, appends.length);
  }
}
// Re-type numeric columns after a text append so the Sheet can sort/chart them.
const NUMERIC = ['age', 'bodyweight', 'days_per_week', 'session_length', 'duration_min', 'xp', 'set_number', 'weight', 'reps', 'rpe', 'form', 'result', 'value', 'level', 'streak', 'longest', 'updated', 'created', 'ts'];
function numericCols_(sh, head, start, n) {
  head.forEach((h, i) => {
    if (NUMERIC.indexOf(h) < 0) return;
    const r = sh.getRange(start, i + 1, n, 1);
    r.setNumberFormat('General').setValues(r.getValues().map(x => [x[0] === '' ? '' : (isNaN(+x[0]) ? x[0] : +x[0])]));
  });
}

// ---------- API ----------
const API_FNS = {
  // Is the backend reachable, is the PIN right, is the coach set up?
  ping() { return { coach: !!apiKey_(), now: Date.now() }; },

  // Everything changed since `since` (ms). since = 0 → everything.
  sync(since) {
    since = +since || 0;
    const tabs = {};
    Object.keys(TABS).forEach(n => { tabs[n] = readTab_(n).filter(r => (+r.updated || 0) > since); });
    return { now: Date.now(), tabs: tabs };
  },

  // ops = [{ tab, rows }]
  save(ops) {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const now = Date.now();
      (ops || []).forEach(op => { if (TABS[op.tab]) upsert_(op.tab, op.rows, now); });
      return { now: now };
    } finally { lock.releaseLock(); }
  },

  // Ask the coach. req = { profile_id, teen, name, mode: 'chat'|'adjust', question, context, history:[{q,a}] }
  coach(req) {
    const system = coachSystem_(req) + '\n\n' + String(req.context || '').slice(0, 12000);
    const msgs = [];
    (req.history || []).slice(-6).forEach(h => { msgs.push({ role: 'user', content: String(h.q) }); msgs.push({ role: 'assistant', content: String(h.a) }); });
    msgs.push({ role: 'user', content: String(req.question || '').slice(0, 2000) });
    const text = claude_(system, msgs, 900);
    let reply = text, changes = [];
    if (req.mode === 'adjust') {
      const j = parseJson_(text);
      if (j) { reply = String(j.reply || ''); changes = Array.isArray(j.changes) ? j.changes.slice(0, 8) : []; }
    }
    const id = 'c' + Date.now().toString(36);
    API_FNS.save([{ tab: 'Coach', rows: [{ id: id, profile_id: req.profile_id, ts: Date.now(), mode: req.mode, q: req.question, a: reply }] }]);
    return { id: id, reply: reply, changes: changes };
  },

  // Write-ups. req = { kind: 'session'|'week', teen, name, context, week }
  recap(req) {
    const text = claude_(recapSystem_(req), [{ role: 'user', content: String(req.context || '').slice(0, 14000) }], 600).trim();
    if (req.kind === 'week' && req.week) API_FNS.save([{ tab: 'Recaps', rows: [{ id: 'week:' + req.week, week: req.week, text: text }] }]);
    return { text: text };
  },
};

// ---------- Claude ----------
function claude_(system, messages, maxTokens) {
  const key = apiKey_();
  if (!key) throw new Error('no_key');
  const model = config_()['Coach model'] || 'claude-sonnet-5-5';
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: model, max_tokens: maxTokens, system: system, messages: messages }),
  });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() >= 300) throw new Error('Coach is unavailable right now (' + ((j.error && j.error.message) || r.getResponseCode()) + ').');
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}
function parseJson_(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

const COACH_BASE = [
  'You are Coach, the strength & conditioning coach inside The Forge, a training app for one household: a dad and his teenage son who train together in their home weight room.',
  'Talk like a great high-school strength coach: direct, specific, encouraging, a little fun. Short — this is read on a phone between sets. Usually under 120 words. Plain text, short paragraphs or simple "•" bullets, no headings or bold.',
  'How the program works (respect it): one core lift per session — squat, bench, clean and deadlift each have their own day. Every lifting day opens with sprints/agility/ladder work and jumps or throws. Core lifts use double progression (hit the top of the rep range on every set with good form, then add weight). The app already set today\'s target weights; build on them rather than inventing new programs.',
  'Safety: you are not a doctor. Sharp or joint pain, pain that changes how they move, numbness, dizziness, chest pain or a head bump → stop that exercise, tell a parent / see a doctor. Never coach through that kind of pain. General soreness or tiredness → lighter load, fewer sets, or a swap is fine.',
  'Use only what the context gives you. Don\'t invent numbers, PRs or history.',
].join('\n');
const COACH_TEEN = [
  'The lifter is the teen (a young athlete). Extra rules, always:',
  '• Form first. Never suggest max testing, 1-rep maxes, "going heavy", or anything beyond the weight the app suggests. Never raise a weight in your changes — only keep it or lower it.',
  '• Prefer technique variations (goblet squat, DB bench, hang clean pulls, trap-bar deadlift) when something feels off.',
  '• No diet, weight-loss, weight-gain, or supplement advice. "Eat real meals, drink water, sleep 9 hours" is fine; anything more → ask Dad or the doctor.',
  '• Any pain → stop that exercise and tell Dad.',
  '• Keep it age-appropriate and encouraging. Talk to him directly.',
].join('\n');
const COACH_ADJUST = [
  'The lifter is mid-workout and may want today\'s workout changed. Reply with ONLY a JSON object, no other text:',
  '{"reply": "what you tell them", "changes": [ ... ]}',
  'changes adjust TODAY\'s workout only (not the plan). Allowed:',
  '{"action":"swap","exercise_id":"<id in today\'s workout>","to":"<id from the exercise list>"}',
  '{"action":"remove","exercise_id":"<id>"}',
  '{"action":"sets","exercise_id":"<id>","sets":<number>}',
  '{"action":"load","exercise_id":"<id>","load_lb":<number>}',
  'Use only ids from the lists given. Keep exactly one core lift in the session (a lighter variation of the same lift is fine). Use "changes": [] when nothing needs changing. Mention each change in the reply.',
].join('\n');

function coachSystem_(req) {
  return [COACH_BASE, req.teen ? COACH_TEEN : 'The lifter is the dad (adult, former college athlete). You can talk RPE, estimated maxes and harder training.', req.mode === 'adjust' ? COACH_ADJUST : ''].filter(Boolean).join('\n\n');
}
function recapSystem_(req) {
  if (req.kind === 'week') return [
    'You are Coach in The Forge, writing the household\'s weekly training recap (a dad and his teen son).',
    'For each lifter: 2–3 short "•" lines — sessions done, best lifts or PRs with real numbers, streak, anything notable from notes.',
    'Then one line of friendly family competition and one focus for next week each. Under 160 words. Plain text, no headings or bold.',
    'Teen rules: praise effort and form, never suggest max testing or diet changes. Use only the data given; don\'t invent numbers.',
  ].join('\n');
  return [
    'You are Coach in The Forge. Write a short post-workout write-up for ' + (req.name || 'the lifter') + (req.teen ? ' (the teen — talk to him directly)' : ' (the dad)') + '.',
    '3–4 sentences: what went well with real numbers from today, one specific thing to focus on next time, and an encouraging closer.',
    req.teen ? 'Teen rules: praise good form ratings, never suggest maxing out or going heavier than the app, no diet talk. If parent notes mention form or pain, address it gently.' : 'Mention RPE or grinders if they show up.',
    'Plain text, no headings, no bold. Use only the data given.',
  ].join('\n');
}

// Run once from the editor to create every tab and the Config rows.
function setup() { config_(); Object.keys(TABS).forEach(tab_); return 'The Forge tabs ready. Now set the Household PIN in the Config tab.'; }
