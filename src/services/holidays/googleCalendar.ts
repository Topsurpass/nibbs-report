import { parseHolidayIcs, type PublicHoliday } from "@/lib/holidays/parseIcs";

/**
 * Nigerian public holidays from Google Calendar's public "Holidays in Nigeria"
 * calendar. A public iCal feed: no API key, no Google account.
 */
export const NIGERIA_HOLIDAYS_ICS =
	"https://calendar.google.com/calendar/ical/en.ng%23holiday%40group.v.calendar.google.com/public/basic.ics";

const REVALIDATE_SECONDS = 12 * 60 * 60;

export interface HolidayFeed {
	holidays: PublicHoliday[];
	fetchedAt: string;
	/** True when Google was unreachable and this is the last good copy. */
	stale: boolean;
}

// Last good copy, so a Google outage serves yesterday's list rather than nothing.
let lastGood: HolidayFeed | null = null;

export async function getNigerianHolidays(): Promise<HolidayFeed | null> {
	try {
		const res = await fetch(NIGERIA_HOLIDAYS_ICS, {
			next: { revalidate: REVALIDATE_SECONDS },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`Google Calendar answered ${res.status}`);
		const holidays = parseHolidayIcs(await res.text());
		// An empty parse means Google sent something other than the calendar.
		if (holidays.length === 0) throw new Error("Holiday feed had no public holidays");
		lastGood = { holidays, fetchedAt: new Date().toISOString(), stale: false };
		return lastGood;
	} catch (err) {
		console.error("[holidays] Google Calendar fetch failed", err);
		return lastGood ? { ...lastGood, stale: true } : null;
	}
}
