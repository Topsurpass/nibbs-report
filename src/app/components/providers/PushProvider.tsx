"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pushSupport, urlBase64ToUint8Array } from "@/lib/push/support";

/**
 * Push notification state for this browser, shared by the header bell and the
 * Duty Register banner so turning it on in one updates the other.
 *
 *   loading        still checking the service worker and subscription
 *   unsupported    this browser has no Web Push
 *   needs-install  iPhone/iPad: add to Home Screen first
 *   unavailable    the server has no VAPID keys configured (`missing` names them)
 *   blocked        the person (or browser policy) denied notifications
 *   off / on       this device is (not) receiving pushes for this user
 */
export type PushState = "loading" | "unsupported" | "needs-install" | "unavailable" | "blocked" | "off" | "on";

interface PushContextValue {
	state: PushState;
	/** Server settings still to add, when `state` is "unavailable". */
	missing: string[];
	busy: boolean;
	error: string | null;
	enable: () => Promise<void>;
	disable: () => Promise<void>;
	sendTest: () => Promise<string>;
}

const PushContext = createContext<PushContextValue | null>(null);

interface PushStatus {
	ok: boolean;
	enabled: boolean;
	publicKey: string | null;
	missing: string[];
	registered: boolean;
}

/** The server's push setup; the public key comes from here, not from the build. */
async function fetchStatus(endpoint?: string): Promise<PushStatus> {
	const q = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
	const res = await fetch(`/api/push/status${q}`, { cache: "no-store" });
	const body = (await res.json()) as PushStatus;
	if (!res.ok && !("enabled" in body)) throw new Error("status failed");
	return { ...body, missing: body.missing ?? [] };
}

async function postJson(url: string, method: string, body?: unknown) {
	const res = await fetch(url, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; delivered?: number };
	if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
	return data;
}

function traits() {
	return {
		hasServiceWorker: "serviceWorker" in navigator,
		hasPushManager: "PushManager" in window,
		hasNotification: "Notification" in window,
		userAgent: navigator.userAgent,
		standalone:
			window.matchMedia("(display-mode: standalone)").matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true,
		maxTouchPoints: navigator.maxTouchPoints ?? 0,
	};
}

export function PushProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<PushState>("loading");
	const [missing, setMissing] = useState<string[]>([]);
	const publicKey = useRef<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Work out the starting state, and keep this device registered for whoever
	// is signed in now (a shared browser, or a server that lost the row).
	useEffect(() => {
		let cancelled = false;
		const settle = (s: PushState) => !cancelled && setState(s);
		(async () => {
			const support = pushSupport(traits());
			if (support !== "supported") return settle(support);
			const reg = await navigator.serviceWorker.register("/sw.js");
			const sub = await reg.pushManager.getSubscription();
			const status = await fetchStatus(sub?.endpoint);
			if (!status.enabled || !status.publicKey) {
				if (!cancelled) setMissing(status.missing);
				return settle("unavailable");
			}
			publicKey.current = status.publicKey;
			if (Notification.permission === "denied") return settle("blocked");
			if (!sub || Notification.permission !== "granted") return settle("off");
			if (!status.registered) await postJson("/api/push/subscribe", "POST", sub.toJSON());
			settle("on");
		})().catch(() => settle("off"));
		return () => {
			cancelled = true;
		};
	}, []);

	const enable = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			// Must run from the click: browsers only show the prompt for a user gesture.
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setState(permission === "denied" ? "blocked" : "off");
				return;
			}
			const key = publicKey.current ?? (await fetchStatus()).publicKey;
			if (!key) {
				setState("unavailable");
				return;
			}
			const reg = await navigator.serviceWorker.register("/sw.js");
			await navigator.serviceWorker.ready;
			const sub =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
			await postJson("/api/push/subscribe", "POST", sub.toJSON());
			setState("on");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't turn on notifications.");
		} finally {
			setBusy(false);
		}
	}, []);

	const disable = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			const reg = await navigator.serviceWorker.getRegistration("/sw.js");
			const sub = await reg?.pushManager.getSubscription();
			if (sub) {
				await postJson("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
				await sub.unsubscribe();
			}
			setState("off");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't turn off notifications.");
		} finally {
			setBusy(false);
		}
	}, []);

	const sendTest = useCallback(async () => {
		const data = await postJson("/api/push/test", "POST");
		return data.delivered === 1 ? "Sent to this device." : `Sent to ${data.delivered} devices.`;
	}, []);

	const value = useMemo(
		() => ({ state, missing, busy, error, enable, disable, sendTest }),
		[state, missing, busy, error, enable, disable, sendTest],
	);
	return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushContextValue {
	const ctx = useContext(PushContext);
	if (!ctx) throw new Error("usePush must be used within PushProvider");
	return ctx;
}
