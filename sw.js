/* =====================================================================
   RideCue — service worker (sw.js)
   Deploy this file to the SAME folder as wdw.html in your GitHub repo.
   It runs in the background (even with the app closed) and is what
   actually shows the notification when a push arrives from the Worker.
   0728kr THE PAGE KEEPS A COPY (the cold start): it also keeps the last
   good copy of the page itself, so a weak signal paints the app in 2.5 s
   and no signal paints it at once - the network is asked first, every
   time, so a good signal always shows the newest build.
   ===================================================================== */

const SHELL_CACHE = "ridecue-shell-v1"; /* 0728kr: one cache, the page itself; bump the name to drop every old copy */
const NET_PATIENCE_MS = 2500;            /* 0728kr: how long a cold start waits for the network before the kept copy paints */

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL_CACHE && /^ridecue-shell-/.test(k)).map((k) => caches.delete(k)))) /* 0728kr: an old cache name is swept on activate */
])));

/* 0728kr THE PAGE KEEPS A COPY — the fetch handler, for the page's own document only.
   Every other request (the live feed, the Worker, the almanac, images) passes straight through, untouched.
   NETWORK FIRST: a 2xx answer is cached and served. THE CACHE SPEAKS after NET_PATIENCE_MS, or at once when
   the network fails outright; the late network answer still refreshes the cache for the next open. With no
   copy kept yet the network's own failure is returned, as before (the shell's offline page, Safari's error). */
function isShellRequest(req) {
  if (req.method !== "GET") return false;
  if (req.mode === "navigate") return true;
  const u = new URL(req.url);
  return u.origin === self.location.origin && /\/wdw\.html$/.test(u.pathname) && req.destination === "document";
}
function shellKey(req) { const u = new URL(req.url); return u.origin + u.pathname; } /* the copy is keyed by path - a #otd or ?v= never makes a second copy */

async function shellRespond(req) {
  const key = shellKey(req);
  const cache = await caches.open(SHELL_CACHE);
  const net = fetch(req).then(async (r) => {
    if (r && r.ok && r.status === 200) { try { await cache.put(key, r.clone()); } catch (_) {} }
    return r;
  });
  const fromCache = () => cache.match(key);
  const patience = new Promise((res) => setTimeout(() => res("late"), NET_PATIENCE_MS));
  const first = await Promise.race([net.then((r) => ({ r }), (e) => ({ e })), patience]);
  if (first !== "late") {
    if (first.r && first.r.ok) return first.r;
    const kept = await fromCache();
    if (kept) return kept;                       /* the network failed outright: the kept copy, at once */
    if (first.r) return first.r;                 /* no copy and an error page from the network: as before */
    throw first.e;                               /* no copy and no network: the shell's offline door opens, as before */
  }
  const kept = await fromCache();
  if (kept) { net.catch(() => {}); return kept; } /* the network is slow: the kept copy paints; the late answer still refreshes the cache */
  return net;                                     /* nothing kept yet: wait the network out, however long */
}

self.addEventListener("fetch", (event) => {
  if (!isShellRequest(event.request)) return;
  event.respondWith(shellRespond(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data.json(); }
  catch (_) { data = { title: "RideCue", body: event.data ? event.data.text() : "" }; }

  const title = data.title || "RideCue";
  const options = {
    body: data.body || "",
    icon: "parkpulse-icon.png",   // upload this PNG next to sw.js
    badge: "parkpulse-icon.png",
    tag: data.tag,                // same tag replaces an older banner for the same ride
    data: { url: data.url || "./wdw.html" }, // 0728il THE NOTIFICATION IS A DOOR: a note may carry its own door (the morning note: ./wdw.html#otd)
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { const u = (event.notification.data || {}).url || ""; if (/#otd$/.test(u) && c.postMessage) c.postMessage({ go: "otd" }); return c.focus(); } } // 0728il: an open app is told where to land
      if (self.clients.openWindow) return self.clients.openWindow(event.notification.data.url || "./");
    })
  );
});

/* If the browser rotates the subscription, re-subscribe and tell the backend.
   (The app also re-syncs on launch, so this is a belt-and-suspenders.) */
self.addEventListener("pushsubscriptionchange", (event) => {
  // The app handles re-subscription on next open; nothing required here for now.
});
