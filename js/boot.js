// boot.js: household PIN (once per phone), pick who's training, first sync, service worker.

function whoScreen(mode, status) {
  show("who");
  $("who-pin").hidden = mode !== "pin";
  $("who-pick").hidden = mode !== "pick";
  $("who-status").textContent = status || "";
  if (mode === "pick") $("who-list").innerHTML = profiles().map(o => `<button class="who-btn${isTeen(o) ? " teen" : ""}" data-act="be" data-id="${o.id}"><span class="av">${esc(o.avatar)}</span><span>${esc(o.name)}<small>${isTeen(o) ? "Athlete" : "Adult"} · Level ${progressOf(o.id).level}</small></span></button>`).join("");
  if (mode === "pin") setTimeout(() => $("pin-in").focus(), 50);
}
function enter() {
  if (ME && profile()) return show("home");
  if (!profiles().length) return show("profile", { fresh: true });
  whoScreen("pick");
}
$("pin-go").addEventListener("click", tryPin);
$("pin-in").addEventListener("keydown", e => { if (e.key === "Enter") tryPin(); });
function tryPin() {
  const v = $("pin-in").value.trim(); if (!v) return;
  store.set("af:pin", v); $("pin-err").hidden = true; $("who-status").textContent = "Checking…";
  api("ping").then(r => { store.set("af:coach", !!r.coach); $("who-status").textContent = "Loading your data…"; return sync(); })
    .then(() => enter())
    .catch(e => { if (/pin/.test(e.message)) store.del("af:pin"); $("pin-err").textContent = errText(e); $("pin-err").hidden = false; $("who-status").textContent = ""; });
}

ACTIONS.reload = () => location.reload();
// Clears this phone's copy (the Sheet keeps everything) and the app cache, then starts fresh at the PIN screen.
ACTIONS["reset-phone"] = () => {
  if (store.get("af:out", []).length && !confirm("Some workouts on this phone haven't synced yet and would be lost. Reset anyway?")) return;
  Object.keys(localStorage).filter(k => k.startsWith("af:")).forEach(k => localStorage.removeItem(k));
  const done = () => location.reload();
  Promise.all([
    navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : 0,
    window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : 0,
  ]).then(done, done);
};

// Never leave the sign-in screen blank: errors show on screen with Reload / Reset buttons.
window.addEventListener("error", e => { if (active === "who") showCrash(e.error || e.message); });
window.addEventListener("unhandledrejection", e => { if (active === "who" && $("who-pin").hidden && $("who-pick").hidden) showCrash(e.reason); });
setTimeout(() => {
  if (active === "who" && !$("v-who").hidden && $("who-pin").hidden && $("who-pick").hidden && !$("who-status").textContent.trim())
    whoScreen(SERVER && !pin() ? "pin" : "pick", "Took too long to load — pick up here.");
}, 8000);

function boot() {
  syncDot();
  if (SERVER && !pin()) return whoScreen("pin");
  enter();
  if (SERVER) api("ping").then(r => { store.set("af:coach", !!r.coach); refresh(); }).catch(() => {});
  if (SERVER) sync().then(changed => { if (changed) refresh(); }).catch(e => { if (/pin/.test(e.message)) { store.del("af:pin"); whoScreen("pin", errText(e)); } });
}
boot();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
