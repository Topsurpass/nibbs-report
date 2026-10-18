// Parse Google's public "Holidays in Nigeria" iCal feed into the public
// holidays only. Pure: the network fetch lives in services/holidays.
//
// Each event looks like:
//   BEGIN:VEVENT
//   DTSTART;VALUE=DATE:20260612
//   SUMMARY:Democracy Day
//   DESCRIPTION:Public holiday          (or "Observance\n…", which we drop)
//   END:VEVENT
// Future lunar holidays carry "(tentative)" in the summary and
// "Date is tentative and may change." in the description.

export interface PublicHoliday {
	/** YYYY-MM-DD */
	date: string;
	name: string;
	/** The date may still change (lunar holidays before they are announced). */
	tentative: boolean;
}

export type HolidayLookup = (date: string) => PublicHoliday | undefined;

/** RFC 5545 line unfolding: a line starting with a space or tab continues the previous one. */
function unfold(text: string): string[] {
	return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

/** Undo iCal text escaping (\\, \; \, \n). */
function unescape(value: string): string {
	return value.replace(/\\n/gi, "\n").replace(/\\([\;,])/g, "$1");
}

export function parseHolidayIcs(text: string): PublicHoliday[] {
	const byDate = new Map<string, PublicHoliday>();
	let event: Record<string, string> | null = null;

	for (const line of unfold(text)) {
		if (line === "BEGIN:VEVENT") {
			event = {};
			continue;
		}
		if (line === "END:VEVENT") {
			const start = event?.DTSTART?.match(/^(\d{4})(\d{2})(\d{2})$/);
			const description = unescape(event?.DESCRIPTION ?? "");
			const summary = unescape(event?.SUMMARY ?? "").trim();
			if (start && summary && /^public holiday/i.test(description)) {
				const date = `${start[1]}-${start[2]}-${start[3]}`;
				const tentative = /\(tentative\)/i.test(summary) || /tentative/i.test(description);
				const name = summary.replace(/\s*\(tentative\)\s*/gi, " ").trim();
				const existing = byDate.get(date);
				byDate.set(
					date,
					existing
						? { date, name: `${existing.name} / ${name}`, tentative: existing.tentative || tentative }
						: { date, name, tentative },
				);
			}
			event = null;
			continue;
		}
		if (!event) continue;
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		// "DTSTART;VALUE=DATE" → "DTSTART"
		const key = line.slice(0, colon).split(";")[0].toUpperCase();
		event[key] = line.slice(colon + 1);
	}

	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function holidayLookup(holidays: PublicHoliday[]): HolidayLookup {
	const map = new Map(holidays.map((h) => [h.date, h]));
	return (date) => map.get(date);
}

/** Local Date → "YYYY-MM-DD" (filename dates are built in local time). */
export function dateKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
