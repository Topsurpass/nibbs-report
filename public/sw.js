// Service worker for push notifications (Duty Register reminders and team
// sign-in / sign-out alerts). It does nothing else: no fetch handler and no
// caching, so it can never serve a stale page.
//
// Payload (from src/lib/push/schedule.ts): { title, body, url, tag, actions?,
// data?, requireInteraction? }. A click opens `url`; the "not-on-duty" action
// records that for the shift and opens nothing.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
	let p;
	try {
		p = event.data ? event.data.json() : null;
	} catch {
		p = null;
	}
	if (!p || !p.title) p = { title: "Audit Toolkit", body: event.data ? event.data.text() : "", url: "/attendance" };

	event.waitUntil(
		self.registration.showNotification(p.title, {
			body: p.body,
			tag: p.tag,
			renotify: Boolean(p.tag),
			requireInteraction: Boolean(p.requireInteraction),
			icon: "/icons/192",
			badge: "/icons/192",
			actions: Array.isArray(p.actions) ? p.actions.slice(0, 2) : [],
			data: { url: p.url || "/attendance", ...(p.data || {}) },
		}),
	);
});

/**
 * Send an open tab of this app to `url` and bring it forward, or open a new
 * one. Navigation comes first: a refused focus() must never stop the page from
 * changing, and a tab this worker doesn't control can't be navigated, so that
 * falls back to a new window.
 */
async function openApp(url) {
	const target = new URL(url, self.location.origin).href;
	const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
	const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
	if (!tab) return self.clients.openWindow(target);
	const moved = await tab.navigate(target).catch(() => null);
	if (!moved) return self.clients.openWindow(target);
	return moved.focus().catch(() => moved);
}

self.addEventListener("notificationclick", (event) => {
	const data = event.notification.data || {};
	event.notification.close();

	if (event.action === "not-on-duty") {
		event.waitUntil(
			fetch("/api/push/not-on-duty", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ shift: data.shift, date: data.date }),
			}).catch(() => undefined),
		);
		return;
	}
	event.waitUntil(openApp(data.url || "/attendance"));
});

// The browser rotated this device's push keys: re-register so pushes keep arriving.
self.addEventListener("pushsubscriptionchange", (event) => {
	const old = event.oldSubscription;
	event.waitUntil(
		(async () => {
			const options = old ? old.options : null;
			if (!options) return;
			const sub = await self.registration.pushManager.subscribe(options);
			await fetch("/api/push/subscribe", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(sub.toJSON()),
			});
		})().catch(() => undefined),
	);
});
