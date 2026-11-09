// Local test server: serves the app AND runs server/Code.gs against a pretend Google Sheet in memory.
//   node tools/dev-server.mjs [port]      then open http://localhost:3200
// Coach replies are canned unless ANTHROPIC_API_KEY is set in your shell (then it calls the real API).
// NO_COACH=1 node tools/dev-server.mjs tests free mode (Coach opens the Claude app instead).
// The Household PIN is 1234. Nothing here is deployed; it's only for trying changes before pushing.
import http from "http"; import fs from "fs"; import path from "path"; import vm from "vm"; import { execFileSync } from "child_process";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = +process.argv[2] || 3200;

// ---------- pretend Apps Script ----------
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j] ?? ""); out.push(row); } return out; }
  setValues(v) { v.forEach((row, i) => { const R = (this.sh.d[this.r - 1 + i] = this.sh.d[this.r - 1 + i] || []); row.forEach((x, j) => (R[this.c - 1 + j] = x)); }); return this; }
  setFontWeight() { return this; } setNumberFormat() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.d = []; }
  getName() { return this.name; }
  getLastRow() { return this.d.length; }
  getLastColumn() { return Math.max(0, ...this.d.map(r => r.length)); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  setFrozenRows() {} autoResizeColumns() {}
}
const sheets = {};
const SS = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)) };
const props = { ANTHROPIC_API_KEY: process.env.NO_COACH ? null : "dev" }; // NO_COACH=1 tests free mode
function claudeFake(body) {
  const b = JSON.parse(body), adjust = /ONLY a JSON object/.test(b.system);
  if (process.env.ANTHROPIC_API_KEY) {
    const out = execFileSync("curl", ["-s", "https://api.anthropic.com/v1/messages", "-H", "x-api-key: " + process.env.ANTHROPIC_API_KEY, "-H", "anthropic-version: 2023-06-01", "-H", "content-type: application/json", "-d", body]).toString();
    return { code: 200, text: out };
  }
  const q = b.messages[b.messages.length - 1].content;
  let text = adjust
    ? JSON.stringify({ reply: "Let's take it easy on that today. I swapped the squat for goblet squats and dropped a set on lunges.", changes: [{ action: "swap", exercise_id: (q.match(/back_squat|goblet_squat/) || ["back_squat"])[0], to: "goblet_squat" }, { action: "swap", exercise_id: "back_squat", to: "goblet_squat" }, { action: "sets", exercise_id: "walking_lunge", sets: 1 }, { action: "load", exercise_id: "goblet_squat", load_lb: 999 }] })
    : /write-up|recap/i.test(b.system) ? "Strong session — every squat set landed at the top of the range with solid form. Next time, keep the same tempo and own the bottom position. Proud of the work." : "Great question. Keep the reps crisp, rest fully, and stop any set that turns sloppy.";
  return { code: 200, text: JSON.stringify({ content: [{ type: "text", text }] }) };
}
const globals = {
  SpreadsheetApp: { getActiveSpreadsheet: () => SS },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
  UrlFetchApp: { fetch: (url, o) => { const r = claudeFake(o.payload); return { getResponseCode: () => r.code, getContentText: () => r.text }; } },
};
const ctx = vm.createContext(Object.assign({ console }, globals));
vm.runInContext(fs.readFileSync(path.join(ROOT, "server/Code.gs"), "utf8") + "\n;globalThis.__srv={doPost,setup};", ctx);
const srv = ctx.__srv; srv.setup();
sheets.Config.d[1][1] = "1234"; // Household PIN

// ---------- http ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/exec") {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      const out = srv.doPost({ postData: { contents: body } });
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(out.s);
    });
    return;
  }
  if (url.pathname === "/config.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(`window.AF_CONFIG={scriptUrl:"http://localhost:${PORT}/exec"};`); }
  if (url.pathname === "/__sheet") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.d])))); }
  const f = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`The Forge dev: http://localhost:${PORT}  (PIN 1234)`));
