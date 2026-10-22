/**
 * Can this browser receive push, and if not, why. Pure, so the rules (notably
 * iPhone/iPad only delivering web push to an installed home-screen app) are
 * tested without a browser.
 */

export type PushSupport = "supported" | "unsupported" | "needs-install";

export interface BrowserTraits {
	hasServiceWorker: boolean;
	hasPushManager: boolean;
	hasNotification: boolean;
	userAgent: string;
	/** Running as an installed app (display-mode: standalone / navigator.standalone). */
	standalone: boolean;
	/** iPadOS reports a Mac user agent; touch points tell them apart. */
	maxTouchPoints: number;
}

export function isAppleMobile(t: Pick<BrowserTraits, "userAgent" | "maxTouchPoints">): boolean {
	return /iPhone|iPad|iPod/.test(t.userAgent) || (/Macintosh/.test(t.userAgent) && t.maxTouchPoints > 1);
}

export function pushSupport(t: BrowserTraits): PushSupport {
	// Safari on iPhone/iPad exposes no PushManager until the app is installed.
	if (isAppleMobile(t) && !t.standalone) return "needs-install";
	return t.hasServiceWorker && t.hasPushManager && t.hasNotification ? "supported" : "unsupported";
}

/** VAPID public key (base64url) → the bytes `pushManager.subscribe` wants. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
	const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(padded);
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}
