/**
 * Every clock decision in night-duty attendance lives here.
 *
 * This is pure, isomorphic and dependency-free on purpose: the browser decides
 * whether to enable the button, and the server decides whether to accept the
 * write, and they MUST agree. Any drift between the two shows up as "the button
 * was there but the save was rejected", so both call these same functions.
 *
 * Date maths is done on epoch milliseconds and read back with `getUTC*`. Nothing
 * here ever touches the host's local timezone — a server in UTC and a laptop in
 * WAT must compute the same night.
 */

/**
 * Africa/Lagos is UTC+01:00 all year. Nigeria has observed no daylight saving
 * since 1980 and has no scheduled change, so a fixed offset is correct rather
 * than merely convenient — and it keeps this module free of Intl/tzdata, which
 * is what lets the same code run in the bundle and in the route handler.
 *
 * If Nigeria ever adopts DST this constant is the single thing that must change.
 */
export const LAGOS_OFFSET_MINUTES = 60;

/** Sign-in opens at 20:00 Lagos — the start of the night shift. */
export const WINDOW_OPEN_MINUTE = 20 * 60;

/** ...and closes at 08:00 Lagos the next morning, when the shift ends. */
export const WINDOW_CLOSE_MINUTE = 8 * 60;

/**
 * Grace for signing out after the window shuts. A shift that runs ten minutes
 * long must still be closeable; without this, an 08:01 hand-over leaves the
 * night permanently open and needing an admin fix.
 */
export const SIGN_OUT_GRACE_MINUTES = 30;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** A night, keyed by the Lagos date it *started* on. Format `YYYY-MM-DD`. */
export type NightDate = string;

/** A month of nights. Format `YYYY-MM`. */
export type MonthKey = string;

export interface LagosClock {
	/** Lagos calendar date. */
	date: NightDate;
	/** Minutes since Lagos midnight, 0-1439. */
	minuteOfDay: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad4 = (n: number) => String(n).padStart(4, "0");

function formatUtcDate(ms: number): string {
	const d = new Date(ms);
	return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Wall-clock time in Lagos for an instant. */
export function toLagos(at: Date): LagosClock {
	const shifted = new Date(at.getTime() + LAGOS_OFFSET_MINUTES * MS_PER_MINUTE);
	return {
		date: formatUtcDate(shifted.getTime()),
		minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
	};
}

/** True for a real calendar date. Rejects `2026-02-30`, not just malformed text. */
export function isNightDate(raw: unknown): raw is NightDate {
	if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
	const [y, m, d] = raw.split("-").map(Number);
	const ms = Date.UTC(y, m - 1, d);
	return formatUtcDate(ms) === raw;
}

/** True for a real `YYYY-MM`. */
export function isMonthKey(raw: unknown): raw is MonthKey {
	if (typeof raw !== "string" || !/^\d{4}-\d{2}$/.test(raw)) return false;
	const month = Number(raw.slice(5));
	return month >= 1 && month <= 12;
}

/** Shift a night key by whole days. */
export function addDays(nightDate: NightDate, days: number): NightDate {
	const [y, m, d] = nightDate.split("-").map(Number);
	return formatUtcDate(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
}

/**
 * Which night an instant belongs to, or `null` when the window is shut.
 *
 * 02:00 on the 5th belongs to the night of the 4th — that is the whole point of
 * keying by the evening the shift started, and it is why a raw timestamp date
 * must never be used as the attendance key.
 */
export function nightDateFor(at: Date): NightDate | null {
	const { date, minuteOfDay } = toLagos(at);
	if (minuteOfDay >= WINDOW_OPEN_MINUTE) return date;
	if (minuteOfDay < WINDOW_CLOSE_MINUTE) return addDays(date, -1);
	return null;
}

/** True while sign-in is permitted. */
export function isWindowOpen(at: Date): boolean {
	return nightDateFor(at) !== null;
}

/** Instant a Lagos wall-clock minute falls on, for a given Lagos date. */
export function lagosInstant(date: NightDate, minuteOfDay: number): Date {
	const [y, m, d] = date.split("-").map(Number);
	const ms =
		Date.UTC(y, m - 1, d) +
		(minuteOfDay - LAGOS_OFFSET_MINUTES) * MS_PER_MINUTE;
	return new Date(ms);
}

/** When sign-in opens for a night (20:00 Lagos on the night's own date). */
export function windowOpensAt(nightDate: NightDate): Date {
	return lagosInstant(nightDate, WINDOW_OPEN_MINUTE);
}

/** When the window shuts (08:00 Lagos the following morning). */
export function windowClosesAt(nightDate: NightDate): Date {
	return lagosInstant(addDays(nightDate, 1), WINDOW_CLOSE_MINUTE);
}

/** Last instant a sign-out is accepted for a night. */
export function signOutDeadline(nightDate: NightDate): Date {
	return new Date(windowClosesAt(nightDate).getTime() + SIGN_OUT_GRACE_MINUTES * MS_PER_MINUTE);
}

/** The next time the window opens, from an instant outside it. */
export function nextOpenAfter(at: Date): Date {
	const { date, minuteOfDay } = toLagos(at);
	if (minuteOfDay < WINDOW_OPEN_MINUTE) return lagosInstant(date, WINDOW_OPEN_MINUTE);
	return lagosInstant(addDays(date, 1), WINDOW_OPEN_MINUTE);
}

/** Sign-out is accepted from the moment the window opens until the grace ends. */
export function canSignOutAt(nightDate: NightDate, at: Date): boolean {
	const t = at.getTime();
	return t >= windowOpensAt(nightDate).getTime() && t <= signOutDeadline(nightDate).getTime();
}

/**
 * Worked minutes, or `null` when it cannot be known. An absent sign-out is a
 * real state, not a zero — the export must show it as missing rather than
 * silently contributing 0 to somebody's monthly hours.
 */
export function durationMinutes(
	signedInAt: Date,
	signedOutAt: Date | null | undefined,
): number | null {
	if (!signedOutAt) return null;
	const minutes = Math.round((signedOutAt.getTime() - signedInAt.getTime()) / MS_PER_MINUTE);
	return minutes >= 0 ? minutes : null;
}

/** `725` → `"12h 05m"`. Totals can exceed 24h, so hours are never wrapped. */
export function formatDuration(minutes: number | null | undefined): string {
	if (minutes === null || minutes === undefined) return "—";
	return `${Math.floor(minutes / 60)}h ${pad2(minutes % 60)}m`;
}

/** `"22:47"` in Lagos, for an instant. 24-hour, because a shift crosses midnight. */
export function formatLagosTime(at: Date): string {
	const { minuteOfDay } = toLagos(at);
	return `${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/** The month a night belongs to. */
export function monthOf(nightDate: NightDate): MonthKey {
	return nightDate.slice(0, 7);
}

/** The month containing an instant's *night*, falling back to its Lagos date. */
export function currentMonth(at: Date): MonthKey {
	return monthOf(nightDateFor(at) ?? toLagos(at).date);
}

/** Shift a month key by whole months. */
export function addMonths(month: MonthKey, delta: number): MonthKey {
	const year = Number(month.slice(0, 4));
	const index = Number(month.slice(5)) - 1 + delta;
	return `${pad4(year + Math.floor(index / 12))}-${pad2(((index % 12) + 12) % 12 + 1)}`;
}

/** First and last night keys of a month, inclusive — the query bounds. */
export function monthBounds(month: MonthKey): { first: NightDate; last: NightDate } {
	const first = `${month}-01`;
	return { first, last: addDays(addMonths(month, 1) + "-01", -1) };
}

export interface GridDay {
	date: NightDate;
	/** False for the leading/trailing days that pad the grid to whole weeks. */
	inMonth: boolean;
}

/**
 * A month laid out as Monday-first weeks, padded with neighbouring days so every
 * row has seven cells. Pure so the calendar's shape is testable without a DOM.
 */
export function buildMonthGrid(month: MonthKey): GridDay[][] {
	const { first, last } = monthBounds(month);
	const [fy, fm, fd] = first.split("-").map(Number);
	// getUTCDay: 0=Sun. Monday-first means Sunday sits at the end of the week.
	const lead = (new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay() + 6) % 7;

	const days: GridDay[] = [];
	for (let i = lead; i > 0; i--) days.push({ date: addDays(first, -i), inMonth: false });
	for (let d = first; d <= last; d = addDays(d, 1)) days.push({ date: d, inMonth: true });
	while (days.length % 7 !== 0) {
		days.push({ date: addDays(days[days.length - 1].date, 1), inMonth: false });
	}

	const weeks: GridDay[][] = [];
	for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
	return weeks;
}

const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

/** `"2026-09"` → `"September 2026"`. */
export function formatMonth(month: MonthKey): string {
	return `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
}

/** `"2026-09-04"` → `"Fri 4 Sep"`. */
export function formatNightLabel(nightDate: NightDate): string {
	const [y, m, d] = nightDate.split("-").map(Number);
	const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
		new Date(Date.UTC(y, m - 1, d)).getUTCDay()
	];
	return `${weekday} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

/**
 * Which night a sign-out at this instant applies to, or `null`.
 *
 * Not the same question as `nightDateFor`: the window shuts at 08:00 but a shift
 * that overruns must still be closeable, so during the grace period this keeps
 * pointing at the night that just ended even though sign-in is already shut.
 */
export function signOutNightFor(at: Date): NightDate | null {
	const current = nightDateFor(at);
	if (current) return current;
	const previous = addDays(toLagos(at).date, -1);
	return canSignOutAt(previous, at) ? previous : null;
}

/** `"20:30"` → `1230` minutes past midnight, or `null` if it isn't a clock time. */
export function parseClock(raw: unknown): number | null {
	if (typeof raw !== "string") return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
}

/**
 * The instant a Lagos wall-clock time falls on *within a given night*.
 *
 * A night spans two calendar dates, so `08:00` means the morning after the
 * night started while `21:00` means the same evening. Splitting at the window's
 * opening minute is what makes an admin typing "08:00" get the right day.
 */
export function instantForNight(nightDate: NightDate, minuteOfDay: number): Date {
	return minuteOfDay >= WINDOW_OPEN_MINUTE
		? lagosInstant(nightDate, minuteOfDay)
		: lagosInstant(addDays(nightDate, 1), minuteOfDay);
}

/** True when an instant falls inside a night's shift, grace included. */
export function isWithinNight(nightDate: NightDate, at: Date): boolean {
	return canSignOutAt(nightDate, at);
}

/**
 * `"3h 12m"` / `"12m 04s"` / `"04s"` for a countdown.
 *
 * Seconds are dropped above an hour: a ticking seconds digit next to a
 * three-hour wait is noise, and it forces a re-render nobody reads.
 */
export function formatCountdown(msRemaining: number): string {
	const total = Math.max(0, Math.ceil(msRemaining / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	if (hours > 0) return `${hours}h ${pad2(minutes)}m`;
	if (minutes > 0) return `${minutes}m ${pad2(seconds)}s`;
	return `${pad2(seconds)}s`;
}
