import { test } from "node:test";
import assert from "node:assert/strict";
import { holidayLookup } from "../holidays/parseIcs.ts";
import { buildSessionBoard } from "./board.ts";
import { assessCollection, canMerge } from "./collection.ts";
import { holidayFor, holidayLabel } from "./holidays.ts";
import { sessionFile } from "./testFixtures.ts";

const DEMOCRACY = "12062026"; // Friday 12 June 2026
const THURSDAY = "11062026";
const holidays = holidayLookup([
	{ date: "2026-06-12", name: "Democracy Day", tentative: false },
	{ date: "2026-06-11", name: "Eid El-Fitr", tentative: true },
]);
const day = (ddmmyyyy: string) => [1, 2, 3, 4].map((s) => sessionFile(ddmmyyyy, s));

test("12 June is labelled Democracy Day on the board and merges cleanly", () => {
	const files = day(DEMOCRACY);
	assert.ok(files.every((f) => f.issues.length === 0 && f.valid));
	assert.equal(buildSessionBoard(files, holidays).days[0].holiday?.name, "Democracy Day");
	assert.ok(canMerge(assessCollection(files)));
});

test("a tentative holiday is labelled as such", () => {
	const files = [...day(THURSDAY), ...day(DEMOCRACY)];
	const thu = buildSessionBoard(files, holidays).days[0];
	assert.equal(thu.holiday?.tentative, true);
	assert.equal(holidayLabel(thu.holiday!), "Eid El-Fitr (tentative date)");
});

test("a weekday that is not a holiday is neither labelled nor warned", () => {
	const files = day("10062026");
	assert.equal(buildSessionBoard(files, holidays).days[0].holiday, undefined);
	assert.deepEqual(assessCollection(files).filter((c) => c.status !== "pass"), []);
	assert.equal(holidayFor(null, holidays), undefined);
});

test("weekend files carry no holiday label", () => {
	assert.equal(buildSessionBoard(day("13062026"), holidays).days[0].holiday, undefined);
});
