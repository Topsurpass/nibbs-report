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

test("weekend 13:00: afternoon not open yet (14:30), nothing to say", () => {
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

test("snooze hides a reminder until it expires", () => {
	const memory = snooze(EMPTY_MEMORY, `afternoon:${FRI}`, lagos(FRI, "13:00"));
	assert.equal(decide(lagos(FRI, "13:29"), none, memory), null);
	assert.equal(decide(lagos(FRI, "13:31"), none, memory)?.kind, "sign-in");
});

test("signed in, not out: sign-out reminder from 30 min before close, urgent in grace", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41")) } };
	assert.equal(decide(lagos(FRI, "19:59"), current), null);
	const soon = decide(lagos(FRI, "20:00"), current);
	assert.equal(soon?.kind, "sign-out");
	assert.equal(soon?.kind === "sign-out" && soon.phase, "closing-soon");
	const grace = decide(lagos(FRI, "20:40"), current);
	assert.equal(grace?.kind === "sign-out" && grace.phase, "grace");
	assert.equal(grace?.kind === "sign-out" && grace.deadline.toISOString(), lagos(FRI, "21:00").toISOString());
});

test("after the grace period the shift is locked: no sign-out reminder", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41")) } };
	assert.notEqual(decide(lagos(FRI, "21:01"), current)?.kind, "sign-out");
});

test("signed out already: nothing more to say about that shift", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41"), lagos(FRI, "20:20")) } };
	assert.equal(decide(lagos(FRI, "20:25"), current), null);
});

test("night shift: sign-out reminder from 08:00, urgent 08:30-09:00", () => {
	const current = { ...none, night: { entry: entry("night", FRI, lagos(FRI, "20:35")) } };
	assert.equal(decide(lagos(SAT, "07:59"), current), null);
	assert.equal((decide(lagos(SAT, "08:00"), current) as { phase?: string })?.phase, "closing-soon");
	assert.equal((decide(lagos(SAT, "08:45"), current) as { phase?: string })?.phase, "grace");
	assert.equal(decide(lagos(SAT, "09:01"), current), null);
});

test("20:45: afternoon sign-out (deadline 21:00) wins over night sign-in", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41")) } };
	const r = decide(lagos(FRI, "20:45"), current);
	assert.equal(r?.kind, "sign-out");
	assert.equal(r?.shift, "afternoon");
	// Once signed out, the night sign-in reminder takes over.
	const out = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41"), lagos(FRI, "20:44")) } };
	assert.equal(decide(lagos(FRI, "20:45"), out)?.shift, "night");
});

test("snoozing the closing-soon reminder does not hide the urgent grace one", () => {
	const current = { ...none, afternoon: { entry: entry("afternoon", FRI, lagos(FRI, "12:41")) } };
	const soon = decide(lagos(FRI, "20:10"), current)!;
	const memory = snooze(EMPTY_MEMORY, soon.key, lagos(FRI, "20:10"));
	assert.notEqual(decide(lagos(FRI, "20:20"), current, memory)?.kind, "sign-out");
	assert.equal((decide(lagos(FRI, "20:31"), current, memory) as { phase?: string })?.phase, "grace");
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
