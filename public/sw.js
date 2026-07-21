// This app does not use a service worker. An older app previously served on
// this origin (e.g. localhost:3000) may have registered one at /sw.js, which the
// browser keeps re-fetching (a 404 until this file existed) and which can serve
// stale cached responses. Serving this self-unregistering worker lets that
// lingering registration update to it and remove itself on the next cycle.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.registration.unregister());
});
