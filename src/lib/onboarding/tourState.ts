// Which tours a user has already seen — pure, deterministic. No DOM, no React.
//
// Same shape as `lib/theme.ts`: the decision logic lives here and is unit
// tested, the hook in `hooks/useTour.ts` only owns storage and effects.

export const TOUR_STORAGE_KEY = "nibbs-tours-seen";

/** Stored shape: tour id -> the version the user completed. */
export type SeenTours = Record<string, number>;

/**
 * A tour has an id and a version. Bumping the version re-shows the tour to
 * everyone — the point of a walkthrough is to explain what changed, so a
 * reworked feature deserves to be re-introduced rather than silently skipped.
 */
export interface TourMeta {
	id: string;
	version: number;
}

/** Parse the stored JSON defensively; anything unusable means "seen nothing". */
export function parseSeen(raw: string | null | undefined): SeenTours {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const out: SeenTours = {};
		for (const [id, version] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof version === "number" && Number.isFinite(version)) out[id] = version;
		}
		return out;
	} catch {
		return {};
	}
}

/** Show the tour when it has never been completed, or a newer version exists. */
export function shouldShowTour(seen: SeenTours, tour: TourMeta): boolean {
	const completed = seen[tour.id];
	return completed === undefined || completed < tour.version;
}

/** Record a completed tour. Returns a new object; never mutates the input. */
export function markSeen(seen: SeenTours, tour: TourMeta): SeenTours {
	return { ...seen, [tour.id]: tour.version };
}

/** Clamp a step index into range, so a bad index can never blank the modal. */
export function clampStep(index: number, total: number): number {
	if (total <= 0) return 0;
	if (!Number.isFinite(index)) return 0;
	return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}
