// AthleteForge service worker: opens instantly from the phone, updates quietly in the background.
// tools/stamp.py rewrites V and SHELL; never hand-edit them.
const V = "af-3c60ead23e";
const SHELL = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./styles.css?v=992df0bf02", "./config.js?v=041f9e4200", "./js/data.js?v=a86059aecc", "./js/howto.js?v=7ef689141b", "./js/engine.js?v=f38496c7d9", "./js/core.js?v=b568973bb8", "./js/views.js?v=e5ad8b1413", "./js/workout.js?v=67da42d239", "./js/coach.js?v=8d247c2c86", "./js/boot.js?v=1eb5d91988"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && !k.endsWith("-fonts")).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const key = req.mode === "navigate" ? "./" : req;
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(key, { ignoreSearch: req.mode === "navigate" });
      const net = fetch(req.mode === "navigate" ? new Request("./", { cache: "no-cache" }) : req).then(r => { if (r && r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
      if (hit) { e.waitUntil(net); return hit; }
      return net;
    }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(V + "-fonts").then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; })));
  }
});
