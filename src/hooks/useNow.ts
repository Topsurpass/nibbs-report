"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, re-rendering on a shared tick.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setInterval` for two
 * reasons: the server snapshot is `null`, so the first paint matches the HTML
 * and there is no hydration mismatch from rendering a clock that differs
 * between server and browser; and every consumer shares one timer instead of
 * starting its own.
 *
 * Returns `null` on the server and for the very first client render. Callers
 * must render a placeholder for that, which is also the correct UI — until the
 * browser clock is known, whether the sign-in window is open is unknown too.
 */

const TICK_MS = 1_000;

let current = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
	current = Date.now();
	for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
	listeners.add(onChange);
	if (!timer) {
		current = Date.now();
		timer = setInterval(tick, TICK_MS);
	}
	return () => {
		listeners.delete(onChange);
		if (listeners.size === 0 && timer) {
			clearInterval(timer);
			timer = null;
		}
	};
}

/** Epoch ms, stable between ticks so the store snapshot compares equal. */
function getSnapshot(): number {
	return current;
}

function getServerSnapshot(): number | null {
	return null;
}

export function useNow(): Date | null {
	const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	return ms === null ? null : new Date(ms);
}
