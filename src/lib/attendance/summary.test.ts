import { test } from "node:test";
import assert from "node:assert/strict";
import {
	entryMinutes,
	indexByNight,
	personName,
	sortEntries,
	summarizeMonth,
	totalsOf,
} from "./summary.ts";
import type { AttendanceEntry, AttendancePerson } from "./types.ts";

const ada: AttendancePerson = {
	id: "u1", firstName: "Ada", lastName: "Obi", email: "ada@example.com",
};
const bode: AttendancePerson = {
	id: "u2", firstName: "Bode", lastName: "Ayo", email: "bode@example.com",
};
const chidi: AttendancePerson = {
	id: "u3", firstName: "Chidi", lastName: "Eze", email: "chidi@example.com",
};

/** A complete 12-hour night unless `out` says otherwise. */
function entry(
	userId: string,
	nightDate: string,
	over: Partial<AttendanceEntry> = {},
): AttendanceEntry {
	return {
		id: `${userId}-${nightDate}`,
		userId,
		nightDate,
		signedInAt: `${nightDate}T19:30:00.000Z`,
		signedOutAt: null,
		source: "self",
		note: null,
		recordedBy: null,
		...over,
	};
}

function complete(userId: string, nightDate: string, hours = 12): AttendanceEntry {
	const inAt = new Date(`${nightDate}T19:30:00.000Z`);
	return entry(userId, nightDate, {
		signedOutAt: new Date(inAt.getTime() + hours * 3_600_000).toISOString(),
	});
}

test("personName falls back to email when a name is blank", () => {
	assert.equal(personName(ada), "Ada Obi");
	assert.equal(
		personName({ id: "x", firstName: "", lastName: "", email: "x@example.com" }),
		"x@example.com",
	);
});

test("entryMinutes returns null for an open night, not zero", () => {
	assert.equal(entryMinutes(complete("u1", "2026-09-04")), 720);
	assert.equal(entryMinutes(entry("u1", "2026-09-04")), null);
});

test("an open night is counted but contributes no hours", () => {
	const [row] = summarizeMonth(
		[ada],
		[complete("u1", "2026-09-01"), entry("u1", "2026-09-02")],
	);
	assert.equal(row.nights, 2);
	assert.equal(row.completeNights, 1);
	assert.equal(row.openNights, 1);
	assert.equal(row.totalMinutes, 720);
	// The average is over complete nights only — dividing by 2 would understate it.
	assert.equal(row.averageMinutes, 720);
});

test("people with zero nights still appear on the register", () => {
	const rows = summarizeMonth([ada, bode], [complete("u1", "2026-09-01")]);
	assert.equal(rows.length, 2);
	const bodeRow = rows.find((r) => r.person.id === "u2");
	assert.equal(bodeRow?.nights, 0);
	assert.equal(bodeRow?.totalMinutes, 0);
	assert.equal(bodeRow?.averageMinutes, null);
});

test("rows are ordered by analyst name", () => {
	const rows = summarizeMonth([chidi, ada, bode], []);
	assert.deepEqual(rows.map((r) => personName(r.person)), ["Ada Obi", "Bode Ayo", "Chidi Eze"]);
});

test("entries belonging to nobody in the people list are ignored, not crashed on", () => {
	const rows = summarizeMonth([ada], [complete("ghost", "2026-09-01")]);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].nights, 0);
});

test("totals sum the per-person rows exactly", () => {
	const entries = [
		complete("u1", "2026-09-01"),
		complete("u1", "2026-09-02", 11),
		entry("u2", "2026-09-03"),
	];
	const rows = summarizeMonth([ada, bode, chidi], entries);
	const totals = totalsOf(rows);

	assert.equal(totals.people, 3);
	assert.equal(totals.active, 2); // Chidi worked none
	assert.equal(totals.nights, 3);
	assert.equal(totals.openNights, 1);
	assert.equal(totals.totalMinutes, 720 + 660);
	// The invariant: the totals row is the sum of what is above it.
	assert.equal(totals.nights, rows.reduce((n, r) => n + r.nights, 0));
	assert.equal(totals.totalMinutes, rows.reduce((n, r) => n + r.totalMinutes, 0));
});

test("sortEntries puts the newest night first", () => {
	const sorted = sortEntries([
		entry("u1", "2026-09-01"),
		entry("u1", "2026-09-30"),
		entry("u1", "2026-09-15"),
	]);
	assert.deepEqual(sorted.map((e) => e.nightDate), ["2026-09-30", "2026-09-15", "2026-09-01"]);
});

test("sortEntries does not mutate its input", () => {
	const input = [entry("u1", "2026-09-01"), entry("u1", "2026-09-30")];
	sortEntries(input);
	assert.deepEqual(input.map((e) => e.nightDate), ["2026-09-01", "2026-09-30"]);
});

test("indexByNight groups every entry under its own night", () => {
	const byNight = indexByNight([
		entry("u1", "2026-09-04"),
		entry("u2", "2026-09-04"),
		entry("u1", "2026-09-05"),
	]);
	assert.equal(byNight.get("2026-09-04")?.length, 2);
	assert.equal(byNight.get("2026-09-05")?.length, 1);
	assert.equal(byNight.get("2026-09-06"), undefined);
});
