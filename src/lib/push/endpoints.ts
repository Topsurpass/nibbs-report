/**
 * Only real browser push services may be stored as a device endpoint. The
 * server POSTs to whatever endpoint a device registers, so an open list would
 * let any signed-in user point it at an arbitrary host.
 */

const PUSH_SERVICE_HOSTS = [
	"fcm.googleapis.com", // Chrome, Edge (Chromium), Android
	"android.googleapis.com",
	"push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
	"push.apple.com", // Safari (web.push.apple.com)
	"notify.windows.com", // legacy Edge (*.notify.windows.com)
];

export function isPushServiceEndpoint(endpoint: string, opts: { allowLocal?: boolean } = {}): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== "https:") return false;
	const host = url.hostname.toLowerCase();
	if (opts.allowLocal && (host === "localhost" || host === "127.0.0.1")) return true;
	return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
