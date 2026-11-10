// ===================== THE FORGE: SERVER LOADER =====================
// Paste this ONE time into the Sheet's Apps Script (Extensions → Apps Script). It runs the latest server
// code straight from GitHub, so future updates need no pasting and no deploying: when Claude pushes a new
// server/Code.gs, it's live here within about 10 minutes. If GitHub is ever unreachable, it keeps running
// the last copy it saved.
const AF_SRC = 'https://raw.githubusercontent.com/samahlersmeyer-prog/the-forge/main/server/Code.gs';
let AF_MOD = null;
function AF_() {
  if (AF_MOD) return AF_MOD;
  const cache = CacheService.getScriptCache(), props = PropertiesService.getScriptProperties();
  let src = cache.get('af_src');
  if (!src) {
    try {
      const r = UrlFetchApp.fetch(AF_SRC + '?t=' + Date.now(), { muteHttpExceptions: true });
      const t = r.getResponseCode() === 200 ? r.getContentText() : '';
      if (t.indexOf('function doPost') >= 0 && t.indexOf('API_FNS') >= 0) {
        src = t; cache.put('af_src', src, 600);
        // backup copy in Script Properties (8KB pieces) in case GitHub is down later
        const old = +(props.getProperty('af_n') || 0), n = Math.ceil(src.length / 8000), kv = { af_n: String(n) };
        for (let i = 0; i < n; i++) kv['af_' + i] = src.slice(i * 8000, (i + 1) * 8000);
        props.setProperties(kv); for (let i = n; i < old; i++) props.deleteProperty('af_' + i);
        props.setProperty('af_loaded', new Date().toISOString() + ' from GitHub (' + src.length + ' chars)');
      }
    } catch (e) { props.setProperty('af_loaded', new Date().toISOString() + ' GitHub error: ' + e.message); }
  }
  if (!src) { const n = +(props.getProperty('af_n') || 0); src = ''; for (let i = 0; i < n; i++) src += props.getProperty('af_' + i) || ''; }
  if (!src) throw new Error('Server code not loaded yet. Check that GitHub is reachable.');
  AF_MOD = new Function(src + '\n;return { doGet: doGet, doPost: doPost, setup: setup };')();
  return AF_MOD;
}
// Never called. Google only asks for the permissions it can see in this file, and the server code is loaded
// from GitHub at run time, so this line is what makes it ask for access to this spreadsheet.
function permissions_() { SpreadsheetApp.getActiveSpreadsheet(); }
function doGet(e) { return AF_().doGet(e); }
function doPost(e) { return AF_().doPost(e); }
// Run this once from the editor: loads the code, creates the tabs and the Config rows.
function setup() { CacheService.getScriptCache().remove('af_src'); AF_MOD = null; return AF_().setup(); }
