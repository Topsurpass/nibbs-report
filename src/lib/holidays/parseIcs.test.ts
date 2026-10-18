import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKey, holidayLookup, parseHolidayIcs } from "./parseIcs.ts";

const ev = (date: string, summary: string, description: string) =>
	["BEGIN:VEVENT", `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${date}`, `SUMMARY:${summary}`, `DESCRIPTION:${description}`, "END:VEVENT"].join("\r\n");

const ICS = [
	"BEGIN:VCALENDAR",
	ev("20260612", "Democracy Day", "Public holiday"),
	ev("20260214", "Valentine's Day", "Observance\\nTo hide observances\\, go to Google Calendar Settings"),
	ev("20270310", "Eid El-Fitr (tentative)", "Public holiday\\nDate is tentative and may change."),
	ev("20260527", "Id el Kabir", "Public holiday"),
	ev("20260527", "Children's Day", "Observance"),
	ev("20261225", "Christmas Day", "Public holiday"),
	ev("20261225", "Some Second Holiday", "Public holiday"),
	// Folded line (RFC 5545): the summary continues on the next line after a space.
	["BEGIN:VEVENT", "DTSTART;VALUE=DATE:20260501", "SUMMARY:Workers'", "  Day", "DESCRIPTION:Public", "  holiday", "END:VEVENT"].join("\r\n"),
	"END:VCALENDAR",
].join("\r\n");

test("keeps public holidays only, sorted by date", () => {
	const list = parseHolidayIcs(ICS);
	assert.deepEqual(list.map((h) => [h.date, h.name]), [
		["2026-05-01", "Workers' Day"],
		["2026-05-27", "Id el Kabir"],
		["2026-06-12", "Democracy Day"],
		["2026-12-25", "Christmas Day / Some Second Holiday"],
		["2027-03-10", "Eid El-Fitr"],
	]);
});

test("observances never become holidays", () => {
	const names = parseHolidayIcs(ICS).map((h) => h.name).join("|");
	assert.doesNotMatch(names, /Valentine|Children/);
});

test("tentative lunar dates are flagged and the label cleaned", () => {
	const eid = parseHolidayIcs(ICS).find((h) => h.date === "2027-03-10")!;
	assert.equal(eid.name, "Eid El-Fitr");
	assert.equal(eid.tentative, true);
	assert.equal(parseHolidayIcs(ICS).find((h) => h.date === "2026-06-12")!.tentative, false);
});

test("lookup by date and local date keys", () => {
	const lookup = holidayLookup(parseHolidayIcs(ICS));
	assert.equal(lookup(dateKey(new Date(2026, 5, 12)))?.name, "Democracy Day");
	assert.equal(lookup("2026-06-11"), undefined);
});

test("empty or malformed input gives an empty list, never throws", () => {
	assert.deepEqual(parseHolidayIcs(""), []);
	assert.deepEqual(parseHolidayIcs("<html>Error 500</html>"), []);
	assert.deepEqual(parseHolidayIcs("BEGIN:VEVENT\r\nSUMMARY:No date\r\nDESCRIPTION:Public holiday\r\nEND:VEVENT"), []);
});
