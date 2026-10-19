// Look dates up in the Nigerian public holiday calendar. Applied at assessment
// time rather than upload, so files dropped before the calendar loaded are
// still recognised once it arrives.

import { dateKey, type HolidayLookup, type PublicHoliday } from "../holidays/parseIcs.ts";

export function holidayFor(date: Date | null, lookup: HolidayLookup): PublicHoliday | undefined {
	return date ? lookup(dateKey(date)) : undefined;
}

/** "Democracy Day" or "Eid El-Fitr (tentative date)". */
export function holidayLabel(h: PublicHoliday): string {
	return h.tentative ? `${h.name} (tentative date)` : h.name;
}

