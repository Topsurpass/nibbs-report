/**
 * Duty shifts: night and afternoon.
 *
 * `nightWindow.ts` stays the single owner of the night rules; this module adds
 * the afternoon shift beside it and gives every caller one shift-aware API, so
 * the browser and the routes keep running the identical rule for both.
 *
 *   Afternoon   Mon-Fri 12:30 → 20:30   Sat-Sun 14:30 → 20:30   (Lagos)
 *   Night       every day 20:30 → 08:30 next morning
 *
 * Public holidays on a weekday use weekday hours. Both shifts allow the same
 * 30-minute sign-out grace after they close.
 *
 * Like nights, an afternoon is keyed by its Lagos date (`DutyDate`, stored in
 * the `night_date` column). An afternoon never crosses midnight, so its key is
 * simply the day it happened.
 */

import {
	SIGN_OUT_GRACE_MINUTES,
	addDays,
	canSignOutAt as nightCanSignOutAt,
	instantForNight,
	lagosInstant,
	nextOpenAfter as nightNextOpenAfter,
	nightDateFor,
	signOutDeadline as nightSignOutDeadline,
	signOutNightFor,
	toLagos,
	windowClosesAt as nightClosesAt,
	windowOpensAt as nightOpensAt,
	type NightDate,
} from "./nightWindow.ts";

export type Shift = "night" | "afternoon";

/** Same key format as a night: the Lagos date the shift started. */
export type DutyDate = NightDate;

export const SHIFTS: readonly Shift[] = ["night", "afternoon"];

export interface ShiftMeta {
	/** "Night" / "Afternoon" */
	label: string;
	/** "night" / "afternoon", for sentences. */
	noun: string;
	/** "Nights" / "Afternoons", for column headers and counts. */
	plural: string;
	/** "tonight" / "this afternoon" */
	current: string;
}

export const SHIFT_META: Record<Shift, ShiftMeta> = {
	night: { label: "Night", noun: "night", plural: "Nights", current: "tonight" },
	afternoon: { label: "Afternoon", noun: "afternoon", plural: "Afternoons", current: "this afternoon" },
};

/** 12:30 Lagos on Monday-Friday. */
export const AFTERNOON_WEEKDAY_OPEN_MINUTE = 12 * 60 + 30;
/** 14:30 Lagos on Saturday and Sunday. */
export const AFTERNOON_WEEKEND_OPEN_MINUTE = 14 * 60 + 30;
/** Afternoon duty ends at 20:30 every day, as the night shift begins. */
export const AFTERNOON_CLOSE_MINUTE = 20 * 60 + 30;

const MS_PER_MINUTE = 60_000;

export function isShift(raw: unknown): raw is Shift {
	return raw === "night" || raw === "afternoon";
}

/** Anything that isn't a known shift reads as night, the original register. */
export function parseShift(raw: unknown): Shift {
	return isShift(raw) ? raw : "night";
}

/** Saturday or Sunday, for a `YYYY-MM-DD` key. */
export function isWeekendDate(date: DutyDate): boolean {
	const [y, m, d] = date.split("-").map(Number);
	const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return day === 0 || day === 6;
}

function afternoonOpenMinute(date: DutyDate): number {
	return isWeekendDate(date) ? AFTERNOON_WEEKEND_OPEN_MINUTE : AFTERNOON_WEEKDAY_OPEN_MINUTE;
}

/** When sign-in opens for a shift on a date. */
export function shiftOpensAt(shift: Shift, date: DutyDate): Date {
	return shift === "night" ? nightOpensAt(date) : lagosInstant(date, afternoonOpenMinute(date));
}

/** When the shift (and its sign-in window) ends. */
export function shiftClosesAt(shift: Shift, date: DutyDate): Date {
	return shift === "night" ? nightClosesAt(date) : lagosInstant(date, AFTERNOON_CLOSE_MINUTE);
}

/** Last instant a sign-out is accepted. */
export function shiftSignOutDeadline(shift: Shift, date: DutyDate): Date {
	return shift === "night"
		? nightSignOutDeadline(date)
		: new Date(shiftClosesAt(shift, date).getTime() + SIGN_OUT_GRACE_MINUTES * MS_PER_MINUTE);
}

/** The shift date currently open for sign-in, or null when the window is shut. */
export function dutyDateFor(shift: Shift, at: Date): DutyDate | null {
	if (shift === "night") return nightDateFor(at);
	const { date } = toLagos(at);
	const t = at.getTime();
	return t >= shiftOpensAt("afternoon", date).getTime() && t < shiftClosesAt("afternoon", date).getTime()
		? date
		: null;
}

/** Sign-out is accepted from the moment the shift opens until its grace ends. */
export function canSignOutDuty(shift: Shift, date: DutyDate, at: Date): boolean {
	if (shift === "night") return nightCanSignOutAt(date, at);
	const t = at.getTime();
	return t >= shiftOpensAt(shift, date).getTime() && t <= shiftSignOutDeadline(shift, date).getTime();
}

/** Which shift date a sign-out at this instant applies to, grace included. */
export function signOutDutyFor(shift: Shift, at: Date): DutyDate | null {
	if (shift === "night") return signOutNightFor(at);
	const { date } = toLagos(at);
	return canSignOutDuty("afternoon", date, at) ? date : null;
}

/** The next time sign-in opens, from an instant outside the window. */
export function nextShiftOpenAfter(shift: Shift, at: Date): Date {
	if (shift === "night") return nightNextOpenAfter(at);
	const { date } = toLagos(at);
	const today = shiftOpensAt("afternoon", date);
	return at.getTime() < today.getTime() ? today : shiftOpensAt("afternoon", addDays(date, 1));
}

/**
 * The instant a Lagos wall-clock time falls on within a shift. Nights span two
 * dates (see `instantForNight`); an afternoon is always its own date.
 */
export function instantForDuty(shift: Shift, date: DutyDate, minuteOfDay: number): Date {
	return shift === "night" ? instantForNight(date, minuteOfDay) : lagosInstant(date, minuteOfDay);
}

/** True when an instant falls inside a shift, grace included. */
export function isWithinDuty(shift: Shift, date: DutyDate, at: Date): boolean {
	return canSignOutDuty(shift, date, at);
}

const clock = (minute: number) =>
	`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** `"12:30"` / `"14:30"` / `"20:30"`: the standard start time on a date. */
export function shiftStartClock(shift: Shift, date: DutyDate): string {
	return shift === "night" ? "20:30" : clock(afternoonOpenMinute(date));
}

/** `"20:30"` / `"08:30"`: the standard end time. */
export function shiftEndClock(shift: Shift): string {
	return shift === "night" ? "08:30" : clock(AFTERNOON_CLOSE_MINUTE);
}

/** `"12:30–20:30"` for a date, as shown in hints and errors. */
export function shiftHours(shift: Shift, date: DutyDate): string {
	return `${shiftStartClock(shift, date)}–${shiftEndClock(shift)}`;
}

/** Plain-language hours for both day types, for help text. */
export function shiftHoursSummary(shift: Shift): string {
	return shift === "night"
		? "20:30 → 08:30 every day"
		: "12:30 → 20:30 on weekdays, 14:30 → 20:30 on weekends";
}

/**
 * Which shift the register should open on: the afternoon while its sign-in is
 * open, or while the viewer still has an afternoon to sign out of; otherwise
 * the night.
 */
export function defaultShift(at: Date, hasOpenAfternoon = false): Shift {
	if (dutyDateFor("afternoon", at)) return "afternoon";
	if (hasOpenAfternoon && signOutDutyFor("afternoon", at)) return "afternoon";
	return "night";
}

/** The date the card is about: open for sign-in, or still in sign-out grace. */
export function activeDutyDate(shift: Shift, at: Date): DutyDate | null {
	return dutyDateFor(shift, at) ?? signOutDutyFor(shift, at);
}
