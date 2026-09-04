import { durationMinutes, type NightDate } from "./nightWindow.ts";
import type { AttendanceEntry, AttendancePerson, PersonMonthSummary } from "./types.ts";

/**
 * Pure roll-ups over a month of register rows.
 *
 * Shared by the on-screen totals, the Excel export and the JPEG summary so the
 * three can never disagree about how many nights somebody worked.
 */

export function personName(person: AttendancePerson): string {
	return `${person.firstName} ${person.lastName}`.trim() || person.email;
}

/** Nights, newest first — the order the detail table and export both use. */
export function sortEntries(entries: AttendanceEntry[]): AttendanceEntry[] {
	return [...entries].sort((a, b) =>
		a.nightDate === b.nightDate
			? a.signedInAt.localeCompare(b.signedInAt)
			: b.nightDate.localeCompare(a.nightDate),
	);
}

/** Night key → the entries on it, for painting a calendar cell. */
export function indexByNight(entries: AttendanceEntry[]): Map<NightDate, AttendanceEntry[]> {
	const byNight = new Map<NightDate, AttendanceEntry[]>();
	for (const entry of entries) {
		const bucket = byNight.get(entry.nightDate);
		if (bucket) bucket.push(entry);
		else byNight.set(entry.nightDate, [entry]);
	}
	return byNight;
}

/** Minutes worked on one entry, or null when it was never signed out of. */
export function entryMinutes(entry: AttendanceEntry): number | null {
	return durationMinutes(
		new Date(entry.signedInAt),
		entry.signedOutAt ? new Date(entry.signedOutAt) : null,
	);
}

/**
 * One row per person, including people with zero nights — a register that
 * silently omits whoever never signed in is not a register.
 *
 * Hours sum over complete nights only: an open night's duration is unknown, and
 * counting it as zero would quietly understate somebody's month.
 */
export function summarizeMonth(
	people: AttendancePerson[],
	entries: AttendanceEntry[],
): PersonMonthSummary[] {
	const byUser = new Map<string, AttendanceEntry[]>();
	for (const entry of entries) {
		const bucket = byUser.get(entry.userId);
		if (bucket) bucket.push(entry);
		else byUser.set(entry.userId, [entry]);
	}

	return people
		.map((person) => {
			const mine = byUser.get(person.id) ?? [];
			let completeNights = 0;
			let totalMinutes = 0;
			for (const entry of mine) {
				const minutes = entryMinutes(entry);
				if (minutes === null) continue;
				completeNights++;
				totalMinutes += minutes;
			}
			return {
				person,
				nights: mine.length,
				completeNights,
				openNights: mine.length - completeNights,
				totalMinutes,
				averageMinutes: completeNights === 0 ? null : Math.round(totalMinutes / completeNights),
			};
		})
		.sort((a, b) => personName(a.person).localeCompare(personName(b.person)));
}

export interface MonthTotals {
	people: number;
	/** People with at least one night. */
	active: number;
	nights: number;
	openNights: number;
	totalMinutes: number;
}

export function totalsOf(summaries: PersonMonthSummary[]): MonthTotals {
	return summaries.reduce<MonthTotals>(
		(acc, s) => ({
			people: acc.people + 1,
			active: acc.active + (s.nights > 0 ? 1 : 0),
			nights: acc.nights + s.nights,
			openNights: acc.openNights + s.openNights,
			totalMinutes: acc.totalMinutes + s.totalMinutes,
		}),
		{ people: 0, active: 0, nights: 0, openNights: 0, totalMinutes: 0 },
	);
}
