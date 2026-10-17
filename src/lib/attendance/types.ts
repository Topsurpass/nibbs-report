import type { NightDate } from "./nightWindow.ts";
import type { Shift } from "./shifts.ts";

/** Who created the row: the analyst themselves, or an admin correcting the register. */
export type AttendanceSource = "self" | "admin";

/**
 * One night on the register. Serialisable — the same shape crosses the wire, so
 * timestamps are ISO strings rather than `Date`.
 */
export interface AttendanceEntry {
	id: string;
	userId: string;
	/** Night or afternoon duty. */
	shift: Shift;
	/**
	 * The Lagos date the shift STARTED (see `nightDateFor`). Named for the
	 * original night-only register; for an afternoon it is simply its day.
	 */
	nightDate: NightDate;
	signedInAt: string;
	/** Null while the shift is still open, or when nobody ever signed out. */
	signedOutAt: string | null;
	source: AttendanceSource;
	/** Why an admin added or changed this row. */
	note: string | null;
	recordedBy: string | null;
}

/** The subset of a user the register needs. */
export interface AttendancePerson {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
}

export interface PersonMonthSummary {
	person: AttendancePerson;
	/** Nights signed in for. */
	nights: number;
	/** Of those, how many were also signed out of. */
	completeNights: number;
	/** Signed in but never signed out — hours unknown, not zero. */
	openNights: number;
	/** Summed over complete nights only. */
	totalMinutes: number;
	/** Mean over complete nights, or null when there are none. */
	averageMinutes: number | null;
}
