/* =====================================================================
   RideCue — service worker (sw.js)
   Deploy this file to the SAME folder as wdw.html in your GitHub repo.
   It runs in the background (even with the app closed) and is what
   actually shows the notification when a push arrives from the Worker.
   ===================================================================== */

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
    data: { url: "./wdw.html" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(event.notification.data.url || "./");
    })
  );
});

/* If the browser rotates the subscription, re-subscribe and tell the backend.
   (The app also re-syncs on launch, so this is a belt-and-suspenders.) */
self.addEventListener("pushsubscriptionchange", (event) => {
  // The app handles re-subscription on next open; nothing required here for now.
});
