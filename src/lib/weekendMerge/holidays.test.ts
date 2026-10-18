import { test } from "node:test";
import assert from "node:assert/strict";
import { holidayLookup } from "../holidays/parseIcs.ts";
import { buildSessionBoard } from "./board.ts";
import { assessCollection, canMerge } from "./collection.ts";
import { applyHolidays } from "./holidays.ts";
import { sessionFile } from "./testFixtures.ts";

const DEMOCRACY = "12062026"; // Friday 12 June 2026
const THURSDAY = "11062026";
const holidays = holidayLookup([
	{ date: "2026-06-12", name: "Democracy Day", tentative: false },
	{ date: "2026-06-11", name: "Eid El-Fitr", tentative: true },
]);
const day = (ddmmyyyy: string) => [1, 2, 3, 4].map((s) => sessionFile(ddmmyyyy, s));
const status = (checks: ReturnType<typeof assessCollection>) => checks.find((c) => c.id === "non-business-days")!;

test("without the calendar, 12 June is just a weekday to confirm", () => {
	const files = day(DEMOCRACY);
	assert.match(files[0].issues.map((i) => i.message).join(), /Friday: confirm this is a public holiday/);
	assert.equal(status(assessCollection(files)).status, "warn");
});

test("with the calendar, 12 June is recognised as Democracy Day", () => {
	const files = applyHolidays(day(DEMOCRACY), holidays);
	assert.ok(files.every((f) => f.issues.length === 0 && f.valid));
	const c = status(assessCollection(files, { holidays }));
	assert.equal(c.status, "pass");
	assert.equal(c.detail, "Weekends plus public holidays: Fri 2026/06/12 is Democracy Day.");
	assert.equal(buildSessionBoard(files, holidays).days[0].holiday?.name, "Democracy Day");
	assert.ok(canMerge(assessCollection(files, { holidays })));
});

test("a tentative holiday is labelled as such", () => {
	const files = applyHolidays([...day(THURSDAY), ...day(DEMOCRACY)], holidays);
	assert.match(status(assessCollection(files, { holidays })).detail, /Thu 2026\/06\/11 is Eid El-Fitr \(tentative date\)/);
	assert.equal(buildSessionBoard(files, holidays).days[0].holiday?.tentative, true);
});

test("a weekday that is not a holiday still warns, and names the known one", () => {
	const files = applyHolidays([...day("10062026"), ...day(DEMOCRACY)], holidays);
	const c = status(assessCollection(files, { holidays }));
	assert.equal(c.status, "warn");
	assert.match(c.detail, /^Wed 2026\/06\/10 is a weekday and not a public holiday on the calendar/);
	assert.match(c.detail, /Fri 2026\/06\/12 is Democracy Day/);
	assert.match(files[0].issues.map((i) => i.message).join(), /Wednesday: confirm/);
});

test("weekend files are untouched by the calendar", () => {
	const sat = day("13062026");
	assert.deepEqual(applyHolidays(sat, holidays), sat);
	assert.equal(buildSessionBoard(sat, holidays).days[0].holiday, undefined);
});
