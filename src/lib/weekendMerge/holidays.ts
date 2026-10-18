// Apply the public holiday calendar to uploaded files. Done at assessment time
// rather than upload, so files dropped before the calendar loaded are still
// recognised once it arrives.

import { dateKey, type HolidayLookup, type PublicHoliday } from "../holidays/parseIcs.ts";
import { isWeekend, type SourceFile } from "./sourceFile.ts";

/** Matches the per-file "Friday: confirm this is a public holiday" warning. */
const CONFIRM_HOLIDAY = /: confirm this is a public holiday$/;

export function holidayFor(date: Date | null, lookup: HolidayLookup): PublicHoliday | undefined {
	return date ? lookup(dateKey(date)) : undefined;
}

/** "Democracy Day" or "Eid El-Fitr (tentative date)". */
export function holidayLabel(h: PublicHoliday): string {
	return h.tentative ? `${h.name} (tentative date)` : h.name;
}

/**
 * Drop the "confirm this is a public holiday" warning from files dated on a
 * known public holiday. Nothing else changes; validity is unaffected because
 * that warning never blocked a merge.
 */
export function applyHolidays(sources: SourceFile[], lookup: HolidayLookup): SourceFile[] {
	return sources.map((f) => {
		if (!f.date || isWeekend(f.date) || !holidayFor(f.date, lookup)) return f;
		const issues = f.issues.filter((i) => !(i.severity === "warn" && CONFIRM_HOLIDAY.test(i.message)));
		return issues.length === f.issues.length ? f : { ...f, issues };
	});
}
