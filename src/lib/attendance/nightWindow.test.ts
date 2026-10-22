import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addDays,
	addMonths,
	buildMonthGrid,
	canSignOutAt,
	currentMonth,
	durationMinutes,
	formatCountdown,
	formatDuration,
	formatLagosTime,
	formatMonth,
	formatNightLabel,
	isMonthKey,
	isNightDate,
	isWindowOpen,
	monthBounds,
	instantForNight,
	isWithinNight,
	nextOpenAfter,
	parseClock,
	nightDateFor,
	signOutDeadline,
	signOutNightFor,
	toLagos,
	windowClosesAt,
	windowOpensAt,
} from "./nightWindow.ts";

/** A Lagos wall-clock instant, written as the UTC that produces it (Lagos = UTC+1). */
const lagos = (iso: string) => new Date(`${iso}+01:00`);

test("toLagos reads wall clock in Lagos, never host local time", () => {
	assert.deepEqual(toLagos(new Date("2026-09-04T19:30:00Z")), {
		date: "2026-09-04",
		minuteOfDay: 20 * 60 + 30,
	});
	// 23:30 UTC is already the next day in Lagos.
	assert.deepEqual(toLagos(new Date("2026-09-04T23:30:00Z")), {
		date: "2026-09-05",
		minuteOfDay: 30,
	});
});

test("window opens at 20:00 and not a minute before", () => {
	assert.equal(nightDateFor(lagos("2026-09-04T19:59:59")), null);
	assert.equal(nightDateFor(lagos("2026-09-04T20:00:00")), "2026-09-04");
	assert.equal(isWindowOpen(lagos("2026-09-04T19:59:00")), false);
	assert.equal(isWindowOpen(lagos("2026-09-04T20:01:00")), true);
});

test("after midnight still belongs to the night that started the evening before", () => {
	assert.equal(nightDateFor(lagos("2026-09-04T23:30:00")), "2026-09-04");
	assert.equal(nightDateFor(lagos("2026-09-05T01:30:00")), "2026-09-04");
	assert.equal(nightDateFor(lagos("2026-09-05T07:59:59")), "2026-09-04");
});

test("window shuts at 08:00 — the daytime gap has no night", () => {
	assert.equal(nightDateFor(lagos("2026-09-05T08:00:00")), null);
	assert.equal(nightDateFor(lagos("2026-09-05T11:30:00")), null);
	assert.equal(nightDateFor(lagos("2026-09-05T19:59:00")), null);
	// ...and the next evening starts a NEW night, not a continuation.
	assert.equal(nightDateFor(lagos("2026-09-05T20:00:00")), "2026-09-05");
});

test("night key rolls across month and year boundaries", () => {
	assert.equal(nightDateFor(lagos("2026-10-01T01:00:00")), "2026-09-30");
	assert.equal(nightDateFor(lagos("2027-01-01T03:00:00")), "2026-12-31");
	assert.equal(nightDateFor(lagos("2026-03-01T02:00:00")), "2026-02-28");
});

test("a whole night maps to exactly one key, sampled every 10 minutes", () => {
	// The invariant that matters: no instant inside the shift can be attributed
	// to a different night, and no instant outside it gets a night at all.
	const open = windowOpensAt("2026-09-04").getTime();
	const close = windowClosesAt("2026-09-04").getTime();
	for (let t = open; t < close; t += 10 * 60_000) {
		assert.equal(nightDateFor(new Date(t)), "2026-09-04", `at ${new Date(t).toISOString()}`);
	}
	assert.equal(nightDateFor(new Date(open - 60_000)), null);
	assert.equal(nightDateFor(new Date(close)), null);
});

test("window bounds are 12 hours apart", () => {
	const open = windowOpensAt("2026-09-04");
	const close = windowClosesAt("2026-09-04");
	assert.equal(open.toISOString(), "2026-09-04T19:00:00.000Z");
	assert.equal(close.toISOString(), "2026-09-05T07:00:00.000Z");
	assert.equal((close.getTime() - open.getTime()) / 3_600_000, 12);
});

test("sign-out gets a 30 minute grace past the close, then stops", () => {
	assert.equal(signOutDeadline("2026-09-04").toISOString(), "2026-09-05T07:30:00.000Z");
	assert.equal(canSignOutAt("2026-09-04", lagos("2026-09-05T07:59:00")), true);
	assert.equal(canSignOutAt("2026-09-04", lagos("2026-09-05T08:30:00")), true);
	assert.equal(canSignOutAt("2026-09-04", lagos("2026-09-05T08:31:00")), false);
	// Never before the shift began.
	assert.equal(canSignOutAt("2026-09-04", lagos("2026-09-04T19:59:00")), false);
});

test("duration: absent sign-out is missing, not zero", () => {
	const inAt = lagos("2026-09-04T20:30:00");
	assert.equal(durationMinutes(inAt, lagos("2026-09-05T08:30:00")), 720);
	assert.equal(durationMinutes(inAt, null), null);
	assert.equal(durationMinutes(inAt, undefined), null);
	// Corrupt ordering must not produce negative hours in someone's total.
	assert.equal(durationMinutes(inAt, lagos("2026-09-04T19:00:00")), null);
});

test("formatDuration pads minutes and never wraps hours", () => {
	assert.equal(formatDuration(725), "12h 05m");
	assert.equal(formatDuration(0), "0h 00m");
	assert.equal(formatDuration(2_895), "48h 15m");
	assert.equal(formatDuration(null), "—");
});

test("formatLagosTime is 24-hour Lagos wall clock", () => {
	assert.equal(formatLagosTime(new Date("2026-09-04T19:30:00Z")), "20:30");
	assert.equal(formatLagosTime(new Date("2026-09-04T23:05:00Z")), "00:05");
});

test("nextOpenAfter finds tonight before 20:00 and tomorrow after the close", () => {
	assert.equal(
		nextOpenAfter(lagos("2026-09-05T11:30:00")).toISOString(),
		"2026-09-05T19:00:00.000Z",
	);
	// Already inside a night (02:00) → the next window is this evening.
	assert.equal(
		nextOpenAfter(lagos("2026-09-05T01:30:00")).toISOString(),
		"2026-09-05T19:00:00.000Z",
	);
	// Just after opening → tomorrow.
	assert.equal(
		nextOpenAfter(lagos("2026-09-05T20:30:00")).toISOString(),
		"2026-09-06T19:00:00.000Z",
	);
});

test("date validation rejects impossible dates, not just bad shapes", () => {
	assert.equal(isNightDate("2026-09-04"), true);
	assert.equal(isNightDate("2026-02-29"), false); // 2026 is not a leap year
	assert.equal(isNightDate("2024-02-29"), true);
	assert.equal(isNightDate("2026-13-01"), false);
	assert.equal(isNightDate("2026-09-31"), false);
	assert.equal(isNightDate("2026-9-4"), false);
	assert.equal(isNightDate(""), false);
	assert.equal(isNightDate(20260904), false);
	assert.equal(isMonthKey("2026-09"), true);
	assert.equal(isMonthKey("2026-00"), false);
	assert.equal(isMonthKey("2026-13"), false);
	assert.equal(isMonthKey("2026-09-04"), false);
});

test("addDays and addMonths cross year boundaries in both directions", () => {
	assert.equal(addDays("2026-12-31", 1), "2027-01-01");
	assert.equal(addDays("2026-01-01", -1), "2025-12-31");
	assert.equal(addDays("2024-02-28", 1), "2024-02-29");
	assert.equal(addMonths("2026-12", 1), "2027-01");
	assert.equal(addMonths("2026-01", -1), "2025-12");
	assert.equal(addMonths("2026-06", 12), "2027-06");
	assert.equal(addMonths("2026-06", -18), "2024-12");
});

test("monthBounds covers the month exactly, including February", () => {
	assert.deepEqual(monthBounds("2026-09"), { first: "2026-09-01", last: "2026-09-30" });
	assert.deepEqual(monthBounds("2026-02"), { first: "2026-02-01", last: "2026-02-28" });
	assert.deepEqual(monthBounds("2024-02"), { first: "2024-02-01", last: "2024-02-29" });
	assert.deepEqual(monthBounds("2026-12"), { first: "2026-12-01", last: "2026-12-31" });
});

test("month grid is whole Monday-first weeks and contains every day once", () => {
	const weeks = buildMonthGrid("2026-09");
	assert.ok(weeks.every((w) => w.length === 7));

	const inMonth = weeks.flat().filter((d) => d.inMonth).map((d) => d.date);
	assert.equal(inMonth.length, 30);
	assert.equal(inMonth[0], "2026-09-01");
	assert.equal(inMonth[29], "2026-09-30");
	assert.equal(new Set(inMonth).size, 30);

	// 2026-09-01 is a Tuesday, so exactly one padding day leads the grid.
	assert.equal(weeks[0][0].date, "2026-08-31");
	assert.equal(weeks[0][0].inMonth, false);
	assert.equal(weeks[0][1].date, "2026-09-01");

	// Dates run strictly consecutively across the whole grid, padding included.
	const all = weeks.flat().map((d) => d.date);
	for (let i = 1; i < all.length; i++) {
		assert.equal(all[i], addDays(all[i - 1], 1));
	}
});

test("month grid handles a month starting on Monday and on Sunday", () => {
	// 2026-06-01 is a Monday → no leading padding.
	const june = buildMonthGrid("2026-06");
	assert.equal(june[0][0].date, "2026-06-01");
	assert.equal(june[0][0].inMonth, true);

	// 2026-11-01 is a Sunday → six leading padding days under Monday-first.
	const nov = buildMonthGrid("2026-11");
	assert.equal(nov[0][6].date, "2026-11-01");
	assert.equal(nov[0].filter((d) => d.inMonth).length, 1);
});

test("currentMonth follows the night, not the wall date", () => {
	// 01:00 on 1 Oct is still the night of 30 Sep, so it counts to September.
	assert.equal(currentMonth(lagos("2026-10-01T01:00:00")), "2026-09");
	assert.equal(currentMonth(lagos("2026-10-01T21:00:00")), "2026-10");
	// Outside the window there is no night; fall back to the Lagos date.
	assert.equal(currentMonth(lagos("2026-10-01T12:00:00")), "2026-10");
});

test("labels", () => {
	assert.equal(formatMonth("2026-09"), "September 2026");
	assert.equal(formatNightLabel("2026-09-04"), "Fri 4 Sep");
	assert.equal(formatNightLabel("2026-12-25"), "Fri 25 Dec");
});

test("signOutNightFor keeps pointing at the finished night through the grace", () => {
	// Mid-shift: same answer as sign-in.
	assert.equal(signOutNightFor(lagos("2026-09-05T01:30:00")), "2026-09-04");
	// Window has shut, but the grace is still running.
	assert.equal(nightDateFor(lagos("2026-09-05T08:15:00")), null);
	assert.equal(signOutNightFor(lagos("2026-09-05T08:15:00")), "2026-09-04");
	assert.equal(signOutNightFor(lagos("2026-09-05T08:30:00")), "2026-09-04");
	// Grace over — nothing left to close.
	assert.equal(signOutNightFor(lagos("2026-09-05T08:31:00")), null);
	assert.equal(signOutNightFor(lagos("2026-09-05T14:30:00")), null);
	// A new evening is a new night, never the old one.
	assert.equal(signOutNightFor(lagos("2026-09-05T20:30:00")), "2026-09-05");
});

test("signOutNightFor never leaks across a month boundary", () => {
	assert.equal(signOutNightFor(lagos("2026-10-01T08:15:00")), "2026-09-30");
	assert.equal(signOutNightFor(lagos("2027-01-01T08:15:00")), "2026-12-31");
});

test("parseClock accepts real clock times only", () => {
	assert.equal(parseClock("20:30"), 1230);
	assert.equal(parseClock("00:00"), 0);
	assert.equal(parseClock("8:05"), 485);
	assert.equal(parseClock(" 23:59 "), 1439);
	assert.equal(parseClock("24:00"), null);
	assert.equal(parseClock("20:60"), null);
	assert.equal(parseClock("2030"), null);
	assert.equal(parseClock("20:3"), null);
	assert.equal(parseClock(1230), null);
	assert.equal(parseClock(null), null);
});

test("instantForNight puts evening times on the night's date and morning times on the next", () => {
	assert.equal(
		instantForNight("2026-09-04", parseClock("20:30")!).toISOString(),
		"2026-09-04T19:30:00.000Z",
	);
	assert.equal(
		instantForNight("2026-09-04", parseClock("23:59")!).toISOString(),
		"2026-09-04T22:59:00.000Z",
	);
	// 00:15 and 08:00 belong to the MORNING AFTER the night started.
	assert.equal(
		instantForNight("2026-09-04", parseClock("00:15")!).toISOString(),
		"2026-09-04T23:15:00.000Z",
	);
	assert.equal(
		instantForNight("2026-09-04", parseClock("08:00")!).toISOString(),
		"2026-09-05T07:00:00.000Z",
	);
	// The night key it produces must round-trip back to the same night.
	for (const clock of ["20:00", "23:00", "00:01", "04:00", "07:59"]) {
		assert.equal(
			nightDateFor(instantForNight("2026-09-04", parseClock(clock)!)),
			"2026-09-04",
			clock,
		);
	}
});

test("isWithinNight rejects times outside the shift", () => {
	assert.equal(isWithinNight("2026-09-04", instantForNight("2026-09-04", parseClock("22:00")!)), true);
	assert.equal(isWithinNight("2026-09-04", instantForNight("2026-09-04", parseClock("08:00")!)), true);
	// 12:00 lands past the grace, on the wrong side of the shift entirely.
	assert.equal(isWithinNight("2026-09-04", instantForNight("2026-09-04", parseClock("12:00")!)), false);
	assert.equal(isWithinNight("2026-09-04", instantForNight("2026-09-04", parseClock("19:00")!)), false);
});

test("formatCountdown drops seconds above an hour and never goes negative", () => {
	assert.equal(formatCountdown(3 * 3_600_000 + 12 * 60_000), "3h 12m");
	assert.equal(formatCountdown(12 * 60_000 + 4_000), "12m 04s");
	assert.equal(formatCountdown(4_000), "04s");
	assert.equal(formatCountdown(0), "00s");
	assert.equal(formatCountdown(-5_000), "00s");
	// Rounds up, so a countdown never shows 0 while time remains.
	assert.equal(formatCountdown(500), "01s");
});
