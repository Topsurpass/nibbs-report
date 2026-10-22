/**
 * When to remind someone to sign in to, or out of, a duty shift.
 *
 * Pure: the clock, the user's current entries and what they already
 * dismissed are passed in, so every rule is testable without a browser.
 * Window rules come from `shifts.ts`, the same module the routes enforce with.
 *
 *   sign-in    the shift is open, they have no entry for it, and they haven't
 *              said "not on duty" or snoozed it
 *   sign-out   they signed in, haven't signed out, and the shift ends within
 *              30 minutes ("closing-soon") or has ended but sign-out is still
 *              allowed ("grace", urgent)
 *
 * A sign-out reminder wins over a sign-in one: it has a hard deadline.
 */

import type { NightDate } from "./nightWindow.ts";
import {
	SHIFTS,
	dutyDateFor,
	shiftClosesAt,
	shiftSignOutDeadline,
	type Shift,
} from "./shifts.ts";
import type { AttendanceEntry } from "./types.ts";

/** Sign-out reminders start this long before the shift closes. */
export const SIGN_OUT_LEAD_MINUTES = 30;
/** "Remind me later" hides a reminder for this long. */
export const SNOOZE_MINUTES = 30;

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface CurrentShift {
	/** The user's row for this shift's current date, if any. */
	entry: AttendanceEntry | null;
	/** They said "not on duty" for this shift date (on any device, or a push notification). */
	notOnDuty?: boolean;
}

export type Reminder =
	| { kind: "sign-in"; key: string; shift: Shift; date: NightDate; closesAt: Date }
	| {
			kind: "sign-out";
			key: string;
			shift: Shift;
			date: NightDate;
			phase: "closing-soon" | "grace";
			signedInAt: Date;
			closesAt: Date;
			deadline: Date;
	  };

/** What the user already said, kept per browser. Keys: `${shift}:${date}[:phase]`. */
export interface ReminderMemory {
	/** Shift dates the user said they are not on duty for. */
	notOnDuty: string[];
	/** Reminder key → epoch ms until which it stays hidden. */
	snoozedUntil: Record<string, number>;
}

export const EMPTY_MEMORY: ReminderMemory = { notOnDuty: [], snoozedUntil: {} };

const shiftKey = (shift: Shift, date: NightDate) => `${shift}:${date}`;

function hidden(memory: ReminderMemory, key: string, now: Date): boolean {
	return (memory.snoozedUntil[key] ?? 0) > now.getTime();
}

export function decideReminder(input: {
	now: Date;
	current: Record<Shift, CurrentShift>;
	memory: ReminderMemory;
}): Reminder | null {
	const { now, current, memory } = input;
	const t = now.getTime();

	// 1. Sign-out: an open entry whose shift is ending or in its grace period.
	for (const shift of SHIFTS) {
		const entry = current[shift].entry;
		if (!entry || entry.signedOutAt) continue;
		const closesAt = shiftClosesAt(shift, entry.nightDate);
		const deadline = shiftSignOutDeadline(shift, entry.nightDate);
		if (t < closesAt.getTime() - SIGN_OUT_LEAD_MINUTES * MINUTE || t > deadline.getTime()) continue;
		const phase = t < closesAt.getTime() ? "closing-soon" : "grace";
		const key = `${shiftKey(shift, entry.nightDate)}:${phase}`;
		if (hidden(memory, key, now)) continue;
		return {
			kind: "sign-out",
			key,
			shift,
			date: entry.nightDate,
			phase,
			signedInAt: new Date(entry.signedInAt),
			closesAt,
			deadline,
		};
	}

	// 2. Sign-in: the shift is open and they haven't signed in for it.
	for (const shift of SHIFTS) {
		const date = dutyDateFor(shift, now);
		if (!date) continue;
		const entry = current[shift].entry;
		if (entry && entry.nightDate === date) continue;
		const key = shiftKey(shift, date);
		if (current[shift].notOnDuty || memory.notOnDuty.includes(key) || hidden(memory, key, now)) continue;
		return { kind: "sign-in", key, shift, date, closesAt: shiftClosesAt(shift, date) };
	}

	return null;
}

/** "Not on duty today": never remind about this shift date again. */
export function markNotOnDuty(memory: ReminderMemory, key: string): ReminderMemory {
	return memory.notOnDuty.includes(key) ? memory : { ...memory, notOnDuty: [...memory.notOnDuty, key] };
}

/** "Remind me later": hide this reminder until `now + minutes`. */
export function snooze(memory: ReminderMemory, key: string, now: Date, minutes = SNOOZE_MINUTES): ReminderMemory {
	return { ...memory, snoozedUntil: { ...memory.snoozedUntil, [key]: now.getTime() + minutes * MINUTE } };
}

/** Forget anything about shifts more than two days old, so storage never grows. */
export function pruneMemory(memory: ReminderMemory, now: Date): ReminderMemory {
	const cutoff = now.getTime() - 2 * DAY;
	const recent = (key: string) => {
		const date = key.split(":")[1] ?? "";
		const [y, m, d] = date.split("-").map(Number);
		return Number.isFinite(y) && Date.UTC(y, (m || 1) - 1, d || 1) >= cutoff;
	};
	return {
		notOnDuty: memory.notOnDuty.filter(recent),
		snoozedUntil: Object.fromEntries(
			Object.entries(memory.snoozedUntil).filter(([key, until]) => recent(key) && until > now.getTime()),
		),
	};
}

/** Read stored memory defensively: anything malformed becomes empty. */
export function parseMemory(raw: string | null): ReminderMemory {
	if (!raw) return EMPTY_MEMORY;
	try {
		const v = JSON.parse(raw) as Partial<ReminderMemory>;
		return {
			notOnDuty: Array.isArray(v.notOnDuty) ? v.notOnDuty.filter((k): k is string => typeof k === "string") : [],
			snoozedUntil:
				v.snoozedUntil && typeof v.snoozedUntil === "object"
					? Object.fromEntries(
							Object.entries(v.snoozedUntil).filter(([, until]) => typeof until === "number"),
						)
					: {},
		};
	} catch {
		return EMPTY_MEMORY;
	}
}
