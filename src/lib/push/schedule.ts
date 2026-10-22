/**
 * What push notifications are due, and what they say.
 *
 * Pure: the clock, who is subscribed, their current entries, what was already
 * sent and who said "not on duty" are passed in, so every rule is testable
 * without a browser, a database or a push service. Shift times come from
 * `attendance/shifts.ts`, the same rules the sign-in routes enforce.
 *
 *   sign-in     at the shift's open, and again 60 minutes later, to everyone
 *               subscribed with no entry for that shift date
 *   sign-out    at the close, and urgently 10 minutes before sign-out locks,
 *               to anyone signed in and not yet out
 *
 * A reminder is due for 20 minutes after its time. The cron calls every 5
 * minutes, so a late or skipped tick still sends it; the dedup key (one row
 * per key in the push log) makes sure it is sent once.
 */

import { addDays, formatLagosTime, formatNightLabel, toLagos } from "../attendance/nightWindow.ts";
import {
	SHIFTS,
	SHIFT_META,
	shiftClosesAt,
	shiftHours,
	shiftOpensAt,
	shiftSignOutDeadline,
	type DutyDate,
	type Shift,
} from "../attendance/shifts.ts";
import type { AttendanceEntry } from "../attendance/types.ts";

/** How long after its time a reminder may still go out. */
export const SEND_WINDOW_MINUTES = 20;
/** The second sign-in nudge, after the open. */
export const SIGN_IN_FOLLOW_UP_MINUTES = 60;
/** The urgent sign-out nudge, before sign-out locks. */
export const SIGN_OUT_URGENT_LEAD_MINUTES = 10;

const MINUTE = 60_000;

export type ReminderKind = "sign-in" | "sign-in-again" | "sign-out" | "sign-out-urgent";

/** What the service worker shows. `url` is where a click goes. */
export interface PushPayload {
	title: string;
	body: string;
	url: string;
	/** A newer notification with the same tag replaces the older one. */
	tag: string;
	/** Shown as buttons where the browser supports them. */
	actions?: { action: string; title: string }[];
	/** Extra data the worker needs for an action (e.g. not-on-duty). */
	data?: Record<string, string>;
	/** Keep it on screen until the person acts. */
	requireInteraction?: boolean;
}

export interface DueReminder {
	userId: string;
	/** `${kind}:${shift}:${date}:${userId}` — sent at most once. */
	key: string;
	kind: ReminderKind;
	shift: Shift;
	date: DutyDate;
	payload: PushPayload;
}

export interface ScheduleInput {
	now: Date;
	/** Users with at least one push subscription. */
	subscribers: string[];
	/** Each subscriber's entries for the shift dates in play (any order). */
	entries: AttendanceEntry[];
	/** Keys already sent. */
	sent: ReadonlySet<string>;
	/** `${userId}:${shift}:${date}` the user said they are not on duty for. */
	notOnDuty: ReadonlySet<string>;
}

export const registerUrl = (shift: Shift) => `/attendance?shift=${shift}`;
export const dismissalKey = (userId: string, shift: Shift, date: DutyDate) => `${userId}:${shift}:${date}`;

/** Shift dates whose reminders could fall around `now`: today's and yesterday's. */
export function candidateDates(now: Date): DutyDate[] {
	const { date } = toLagos(now);
	return [addDays(date, -1), date];
}

function inWindow(now: Date, at: Date): boolean {
	const t = now.getTime() - at.getTime();
	return t >= 0 && t < SEND_WINDOW_MINUTES * MINUTE;
}

export function reminderPayload(kind: ReminderKind, shift: Shift, date: DutyDate): PushPayload {
	const meta = SHIFT_META[shift];
	const url = registerUrl(shift);
	const tag = `reminder:${shift}:${date}`;
	switch (kind) {
		case "sign-in":
		case "sign-in-again":
			return {
				title: kind === "sign-in" ? `${meta.label} duty has started` : `Still not signed in for ${meta.current}`,
				body: `${meta.label} duty ${shiftHours(shift, date)}. Tap to sign in if you're on duty.`,
				url,
				tag,
				actions: [
					{ action: "open", title: "Sign in" },
					{ action: "not-on-duty", title: "Not on duty today" },
				],
				data: { shift, date },
			};
		case "sign-out":
			return {
				title: `${meta.label} duty has ended`,
				body: `Sign out before ${formatLagosTime(shiftSignOutDeadline(shift, date))}, when it locks.`,
				url,
				tag,
				actions: [{ action: "open", title: "Sign out" }],
			};
		case "sign-out-urgent":
			return {
				title: `Sign out now: ${meta.noun} locks at ${formatLagosTime(shiftSignOutDeadline(shift, date))}`,
				body: `You're still signed in for the ${meta.noun} of ${formatNightLabel(date)}. After that an admin has to fix it.`,
				url,
				tag,
				actions: [{ action: "open", title: "Sign out" }],
				requireInteraction: true,
			};
	}
}

/** "Ada Obi signed in · Afternoon duty, 12:04". Sent to everyone else. */
export function teamAlertPayload(input: {
	name: string;
	action: "sign-in" | "sign-out";
	shift: Shift;
	date: DutyDate;
	at: Date;
	userId: string;
}): PushPayload {
	const meta = SHIFT_META[input.shift];
	const verb = input.action === "sign-in" ? "signed in" : "signed out";
	return {
		title: `${input.name} ${verb}`,
		body: `${meta.label} duty, ${formatNightLabel(input.date)} at ${formatLagosTime(input.at)}.`,
		url: registerUrl(input.shift),
		// One per person and shift: their sign-out replaces their sign-in.
		tag: `team:${input.userId}:${input.shift}:${input.date}`,
	};
}

export function dueReminders(input: ScheduleInput): DueReminder[] {
	const { now, subscribers, entries, sent, notOnDuty } = input;
	const byKey = new Map(entries.map((e) => [`${e.userId}:${e.shift}:${e.nightDate}`, e]));
	const due: DueReminder[] = [];

	const push = (userId: string, kind: ReminderKind, shift: Shift, date: DutyDate) => {
		const key = `${kind}:${shift}:${date}:${userId}`;
		if (sent.has(key)) return;
		due.push({ userId, key, kind, shift, date, payload: reminderPayload(kind, shift, date) });
	};

	for (const date of candidateDates(now)) {
		for (const shift of SHIFTS) {
			const opens = shiftOpensAt(shift, date);
			const closes = shiftClosesAt(shift, date);
			const deadline = shiftSignOutDeadline(shift, date);
			const signIn = inWindow(now, opens);
			const signInAgain = inWindow(now, new Date(opens.getTime() + SIGN_IN_FOLLOW_UP_MINUTES * MINUTE));
			const signOut = inWindow(now, closes);
			const urgentAt = new Date(deadline.getTime() - SIGN_OUT_URGENT_LEAD_MINUTES * MINUTE);
			// The urgent window ends when sign-out locks.
			const urgent = now.getTime() >= urgentAt.getTime() && now.getTime() < deadline.getTime();
			if (!signIn && !signInAgain && !signOut && !urgent) continue;

			for (const userId of subscribers) {
				const entry = byKey.get(`${userId}:${shift}:${date}`);
				if (!entry) {
					if (notOnDuty.has(dismissalKey(userId, shift, date))) continue;
					if (signIn) push(userId, "sign-in", shift, date);
					else if (signInAgain) push(userId, "sign-in-again", shift, date);
				} else if (!entry.signedOutAt) {
					if (urgent) push(userId, "sign-out-urgent", shift, date);
					else if (signOut) push(userId, "sign-out", shift, date);
				}
			}
		}
	}
	return due;
}
