"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
	markSeen,
	parseSeen,
	shouldShowTour,
	TOUR_STORAGE_KEY,
	type TourMeta,
} from "@/lib/onboarding/tourState";

/** Fires when this tab writes the key; `storage` only fires in *other* tabs. */
const LOCAL_CHANGE_EVENT = "nibbs-tours-seen-change";

function subscribe(onChange: () => void): () => void {
	window.addEventListener("storage", onChange);
	window.addEventListener(LOCAL_CHANGE_EVENT, onChange);
	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(LOCAL_CHANGE_EVENT, onChange);
	};
}

/**
 * Raw stored value, or "" when storage is unavailable. Returning a string keeps
 * the snapshot referentially stable by value, which is what
 * `useSyncExternalStore` requires.
 */
function getClientSnapshot(): string {
	try {
		return localStorage.getItem(TOUR_STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

/**
 * `null` means "not known yet" — during SSR and hydration there is no storage
 * to read. Distinguishing it from "" (read, but empty) is what stops the modal
 * from being rendered open on the server and then yanked away on hydration.
 */
function getServerSnapshot(): string | null {
	return null;
}

interface UseTourResult {
	/** True while the walkthrough should be on screen. */
	open: boolean;
	/** Finished the walkthrough — records the version so it stays closed. */
	complete: () => void;
	/** Replay it on demand (the "Show me around" button). */
	replay: () => void;
}

/**
 * Owns whether a walkthrough is showing, and remembers that it was completed.
 *
 * Storage is localStorage rather than the database on purpose: "have I seen
 * this UI explanation" is a per-browser preference, like the theme and the
 * column picker, not shared reference data. It carries no value worth a round
 * trip, and a wiped browser simply re-offers the tour.
 *
 * The decision itself lives in `lib/onboarding/tourState.ts` and is unit
 * tested; this hook only bridges it to storage.
 */
export function useTour(tour: TourMeta): UseTourResult {
	const stored = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

	// `null` until the user acts; after that their choice wins over the stored
	// default for the rest of the session.
	const [override, setOverride] = useState<"open" | "closed" | null>(null);

	const autoOpen = stored !== null && shouldShowTour(parseSeen(stored), tour);
	const open = override === "open" || (override === null && autoOpen);

	const complete = useCallback(() => {
		setOverride("closed");
		try {
			const seen = parseSeen(localStorage.getItem(TOUR_STORAGE_KEY));
			localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(markSeen(seen, tour)));
			window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
		} catch {
			// Closing must work even when the choice cannot be remembered.
		}
	}, [tour]);

	const replay = useCallback(() => setOverride("open"), []);

	return { open, complete, replay };
}
