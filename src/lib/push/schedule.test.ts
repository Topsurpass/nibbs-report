import { test } from "node:test";
import assert from "node:assert/strict";
import type { Shift } from "../attendance/shifts.ts";
import type { AttendanceEntry } from "../attendance/types.ts";
import { dismissalKey, dueReminders, reminderPayload, teamAlertPayload, type ScheduleInput } from "./schedule.ts";

/** An instant from a Lagos wall-clock reading (UTC+01:00). */
const lagos = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);
const FRI = "2026-10-16";
const SAT = "2026-10-17";
const USERS = ["ada", "bola"];

const entry = (userId: string, shift: Shift, date: string, inAt: Date, outAt: Date | null = null): AttendanceEntry => ({
	id: `${userId}-${shift}-${date}`,
	userId,
	shift,
	nightDate: date,
	signedInAt: inAt.toISOString(),
	signedOutAt: outAt ? outAt.toISOString() : null,
	source: "self",
	note: null,
	recordedBy: null,
});

function due(now: Date, over: Partial<ScheduleInput> = {}) {
	return dueReminders({ now, subscribers: USERS, entries: [], sent: new Set(), notOnDuty: new Set(), ...over });
}
const summary = (r: ReturnType<typeof due>) => r.map((d) => `${d.userId} ${d.kind} ${d.shift} ${d.date}`);

test("weekday afternoon: sign-in reminder at 12:00 to everyone not signed in, not at 11:59", () => {
	assert.deepEqual(due(lagos(FRI, "11:59")), []);
	assert.deepEqual(summary(due(lagos(FRI, "12:00"))), [`ada sign-in afternoon ${FRI}`, `bola sign-in afternoon ${FRI}`]);
	const signedIn = [entry("ada", "afternoon", FRI, lagos(FRI, "12:01"))];
	assert.deepEqual(summary(due(lagos(FRI, "12:05"), { entries: signedIn })), [`bola sign-in afternoon ${FRI}`]);
});

test("weekend afternoon opens at 14:00", () => {
	assert.deepEqual(due(lagos(SAT, "12:00")), []);
	assert.equal(due(lagos(SAT, "14:00")).length, 2);
});

test("a late cron tick within 20 minutes still sends; after that it doesn't", () => {
	assert.equal(due(lagos(FRI, "12:19")).length, 2);
	assert.deepEqual(due(lagos(FRI, "12:20")), []);
});

test("a key already sent is never sent again", () => {
	const first = due(lagos(FRI, "12:00"));
	const sent = new Set(first.map((d) => d.key));
	assert.deepEqual(due(lagos(FRI, "12:05"), { sent }), []);
	assert.equal(first[0].key, `sign-in:afternoon:${FRI}:ada`);
});

test("follow-up sign-in nudge 60 minutes after the open", () => {
	assert.deepEqual(due(lagos(FRI, "12:59")), []);
	assert.deepEqual(summary(due(lagos(FRI, "13:00"))), [`ada sign-in-again afternoon ${FRI}`, `bola sign-in-again afternoon ${FRI}`]);
});

test("'not on duty' silences that shift date for that person only", () => {
	const notOnDuty = new Set([dismissalKey("ada", "afternoon", FRI)]);
	assert.deepEqual(summary(due(lagos(FRI, "12:00"), { notOnDuty })), [`bola sign-in afternoon ${FRI}`]);
	assert.deepEqual(summary(due(lagos(FRI, "13:00"), { notOnDuty })), [`bola sign-in-again afternoon ${FRI}`]);
	// The night sign-in that evening still reminds Ada.
	assert.ok(summary(due(lagos(FRI, "20:00"), { notOnDuty })).includes(`ada sign-in night ${FRI}`));
});

test("sign-out: at the close, urgent 10 minutes before it locks, nothing once out", () => {
	const open = [entry("ada", "afternoon", FRI, lagos(FRI, "12:02"))];
	const signOuts = (now: Date, entries = open) => summary(due(now, { entries })).filter((s) => s.startsWith("ada") && s.includes("afternoon"));
	assert.deepEqual(signOuts(lagos(FRI, "19:59")), []);
	assert.deepEqual(signOuts(lagos(FRI, "20:00")), [`ada sign-out afternoon ${FRI}`]);
	assert.deepEqual(signOuts(lagos(FRI, "20:20")), [`ada sign-out-urgent afternoon ${FRI}`]);
	assert.deepEqual(signOuts(lagos(FRI, "20:30")), []);
	const closed = [entry("ada", "afternoon", FRI, lagos(FRI, "12:02"), lagos(FRI, "19:58"))];
	assert.deepEqual(signOuts(lagos(FRI, "20:00"), closed), []);
});

test("night: sign-in at 20:00, sign-out at 08:00 and urgent at 08:20 the next morning", () => {
	assert.deepEqual(summary(due(lagos(FRI, "20:00"))).filter((s) => s.includes("night")), [`ada sign-in night ${FRI}`, `bola sign-in night ${FRI}`]);
	const open = [entry("bola", "night", FRI, lagos(FRI, "20:03"))];
	assert.deepEqual(summary(due(lagos(SAT, "08:00"), { entries: open })), [`bola sign-out night ${FRI}`]);
	assert.deepEqual(summary(due(lagos(SAT, "08:25"), { entries: open })), [`bola sign-out-urgent night ${FRI}`]);
	assert.deepEqual(summary(due(lagos(SAT, "08:31"), { entries: open })), []);
});

test("payloads: plain words, a 'Not on duty' action, and a click that opens the right register", () => {
	const p = reminderPayload("sign-in", "afternoon", FRI);
	assert.equal(p.title, "Afternoon duty has started");
	assert.equal(p.body, "Afternoon duty 12:00–20:00. Tap to sign in if you're on duty.");
	assert.equal(p.url, "/attendance?shift=afternoon");
	assert.deepEqual(p.actions?.map((a) => a.action), ["open", "not-on-duty"]);
	assert.deepEqual(p.data, { shift: "afternoon", date: FRI });
	const urgent = reminderPayload("sign-out-urgent", "night", FRI);
	assert.equal(urgent.title, "Sign out now: night locks at 08:30");
	assert.equal(urgent.requireInteraction, true);
	assert.equal(urgent.url, "/attendance?shift=night");

	const team = teamAlertPayload({ name: "Ada Obi", action: "sign-in", shift: "afternoon", date: FRI, at: lagos(FRI, "12:04"), userId: "ada" });
	assert.equal(team.title, "Ada Obi signed in");
	assert.match(team.body, /^Afternoon duty, .+ at 12:04\.$/);
	assert.equal(team.url, "/attendance?shift=afternoon");
	const out = teamAlertPayload({ name: "Ada Obi", action: "sign-out", shift: "afternoon", date: FRI, at: lagos(FRI, "19:58"), userId: "ada" });
	assert.equal(out.title, "Ada Obi signed out");
	assert.equal(out.tag, team.tag);
});
