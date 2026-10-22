import { test } from "node:test";
import assert from "node:assert/strict";
import {
	EMPTY_MEMORY,
	decideReminder,
	markNotOnDuty,
	parseMemory,
	pruneMemory,
	snooze,
	type CurrentShift,
} from "./reminders.ts";
import type { Shift } from "./shifts.ts";
import type { AttendanceEntry } from "./types.ts";

/** An instant from a Lagos wall-clock reading (UTC+01:00). */
const lagos = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);
const FRI = "2026-10-16";
const SAT = "2026-10-17";

const entry = (shift: Shift, date: string, inAt: Date, outAt: Date | null = null): AttendanceEntry => ({
	id: `${shift}-${date}`,
	userId: "u1",
	shift,
	nightDate: date,
	signedInAt: inAt.toISOString(),
	signedOutAt: outAt ? outAt.toISOString() : null,
	source: "self",
	note: null,
	recordedBy: null,
});

const none: Record<Shift, CurrentShift> = { night: { entry: null }, afternoon: { entry: null } };
const decide = (now: Date, current = none, memory = EMPTY_MEMORY) => decideReminder({ now, current, memory });

test("weekday afternoon, not signed in: remind to sign in", () => {
	const r = decide(lagos(FRI, "13:00"));
	assert.equal(r?.kind, "sign-in");
	assert.equal(r?.shift, "afternoon");
	assert.equal(r?.key, `afternoon:${FRI}`);
});

test("weekend 13:00: afternoon not open yet (14:00), nothing to say", () => {
	assert.equal(decide(lagos(SAT, "13:00")), null);
	assert.equal(decide(lagos(SAT, "14:30"))?.kind, "sign-in");
});

test("outside every shift window: nothing", () => {
	assert.equal(decide(lagos(FRI, "10:00")), null);
});

test("already signed in for the open shift: no sign-in reminder", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:40")) } };
	assert.equal(decide(lagos(FRI, "13:00"), current), null);
});

test("'not on duty' silences that shift date only", () => {
	const memory = markNotOnDuty(EMPTY_MEMORY, `afternoon:${FRI}`);
	assert.equal(decide(lagos(FRI, "13:00"), none, memory), null);
	// Night sign-in later the same day still reminds.
	assert.equal(decide(lagos(FRI, "21:30"), none, memory)?.shift, "night");
	// Next weekday afternoon reminds again.
	assert.equal(decide(lagos("2026-10-19", "13:00"), none, memory)?.kind, "sign-in");
});

test("'not on duty' said on another device (server flag) silences the sign-in too", () => {
	const current = { ...none, afternoon: { entry: null, notOnDuty: true } };
	assert.equal(decide(lagos(FRI, "13:00"), current), null);
});

test("snooze hides a reminder until it expires", () => {
	const memory = snooze(EMPTY_MEMORY, `afternoon:${FRI}`, lagos(FRI, "13:00"));
	assert.equal(decide(lagos(FRI, "13:29"), none, memory), null);
	assert.equal(decide(lagos(FRI, "13:31"), none, memory)?.kind, "sign-in");
});

test("signed in, not out: sign-out reminder from 30 min before close, urgent in grace", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:11")) } };
	assert.equal(decide(lagos(FRI, "19:29"), current), null);
	const soon = decide(lagos(FRI, "19:30"), current);
	assert.equal(soon?.kind, "sign-out");
	assert.equal(soon?.kind === "sign-out" && soon.phase, "closing-soon");
	const grace = decide(lagos(FRI, "20:10"), current);
	assert.equal(grace?.kind === "sign-out" && grace.phase, "grace");
	assert.equal(grace?.kind === "sign-out" && grace.deadline.toISOString(), lagos(FRI, "20:30").toISOString());
});

test("after the grace period the shift is locked: no sign-out reminder", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41")) } };
	assert.notEqual(decide(lagos(FRI, "21:01"), current)?.kind, "sign-out");
});

test("signed out already: nothing more to say about that shift", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:11"), lagos(FRI, "19:50")) } };
	assert.equal(decide(lagos(FRI, "19:55"), current), null);
});

test("night shift: sign-out reminder from 07:30, urgent 08:00-08:30", () => {
	const current = { ...none, night: { entry: entry("night", FRI, lagos(FRI, "20:05")) } };
	assert.equal(decide(lagos(SAT, "07:29"), current), null);
	assert.equal((decide(lagos(SAT, "07:30"), current) as { phase?: string })?.phase, "closing-soon");
	assert.equal((decide(lagos(SAT, "08:15"), current) as { phase?: string })?.phase, "grace");
	assert.equal(decide(lagos(SAT, "08:31"), current), null);
});

test("20:15: afternoon sign-out (deadline 20:30) wins over night sign-in", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:11")) } };
	const r = decide(lagos(FRI, "20:15"), current);
	assert.equal(r?.kind, "sign-out");
	assert.equal(r?.shift, "afternoon");
	// Once signed out, the night sign-in reminder takes over.
	const out = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:11"), lagos(FRI, "20:14")) } };
	assert.equal(decide(lagos(FRI, "20:15"), out)?.shift, "night");
});

test("snoozing the closing-soon reminder does not hide the urgent grace one", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:11")) } };
	const soon = decide(lagos(FRI, "19:40"), current)!;
	const memory = snooze(EMPTY_MEMORY, soon.key, lagos(FRI, "19:40"));
	assert.notEqual(decide(lagos(FRI, "19:50"), current, memory)?.kind, "sign-out");
	assert.equal((decide(lagos(FRI, "20:01"), current, memory) as { phase?: string })?.phase, "grace");
});

test("memory: prune drops old shifts and expired snoozes; parse survives junk", () => {
	const now = lagos(FRI, "13:00");
	let memory = markNotOnDuty(EMPTY_MEMORY, "afternoon:2026-10-01");
	memory = markNotOnDuty(memory, `afternoon:${FRI}`);
	memory = snooze(memory, "night:2026-10-01", lagos("2026-10-01", "21:00"));
	memory = snooze(memory, `afternoon:${FRI}`, now);
	const pruned = pruneMemory(memory, now);
	assert.deepEqual(pruned.notOnDuty, [`afternoon:${FRI}`]);
	assert.deepEqual(Object.keys(pruned.snoozedUntil), [`afternoon:${FRI}`]);
	assert.deepEqual(parseMemory(JSON.stringify(pruned)), pruned);
	assert.deepEqual(parseMemory("not json"), EMPTY_MEMORY);
	assert.deepEqual(parseMemory(JSON.stringify({ notOnDuty: [1, "x"], snoozedUntil: { a: "no", b: 5 } })), {
		notOnDuty: ["x"],
		snoozedUntil: { b: 5 },
	});
});
