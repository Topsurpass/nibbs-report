import { test } from "node:test";
import assert from "node:assert/strict";
import {
	activeDutyDate,
	canSignOutDuty,
	defaultShift,
	dutyDateFor,
	instantForDuty,
	isWeekendDate,
	isWithinDuty,
	nextShiftOpenAfter,
	parseShift,
	shiftHours,
	shiftOpensAt,
	shiftSignOutDeadline,
	signOutDutyFor,
} from "./shifts.ts";

/** An instant from a Lagos wall-clock reading (UTC+01:00, no DST). */
const lagos = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);

const FRI = "2026-10-16";
const SAT = "2026-10-17";
const SUN = "2026-10-18";

test("weekend detection uses the calendar date, not the host timezone", () => {
	assert.equal(isWeekendDate(FRI), false);
	assert.equal(isWeekendDate(SAT), true);
	assert.equal(isWeekendDate(SUN), true);
	assert.equal(isWeekendDate("2026-10-19"), false);
});

test("weekday afternoon: sign-in open 12:30 up to (not including) 20:30", () => {
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "12:29")), null);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "12:30")), FRI);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "16:00")), FRI);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "20:29")), FRI);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "20:30")), null);
});

test("weekend afternoon opens at 14:30, not 12:30", () => {
	assert.equal(dutyDateFor("afternoon", lagos(SAT, "12:30")), null);
	assert.equal(dutyDateFor("afternoon", lagos(SAT, "14:29")), null);
	assert.equal(dutyDateFor("afternoon", lagos(SAT, "14:30")), SAT);
	assert.equal(dutyDateFor("afternoon", lagos(SUN, "20:00")), SUN);
	assert.equal(shiftHours("afternoon", SAT), "14:30–20:30");
	assert.equal(shiftHours("afternoon", FRI), "12:30–20:30");
});

test("afternoon sign-out allowed through a 30-minute grace, then shut", () => {
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "20:45")), FRI);
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "21:00")), FRI);
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "21:01")), null);
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "12:00")), null);
	assert.equal(shiftSignOutDeadline("afternoon", FRI).toISOString(), lagos(FRI, "21:00").toISOString());
	assert.equal(canSignOutDuty("afternoon", FRI, lagos(FRI, "12:29")), false);
});

test("night rules are unchanged by the shift layer", () => {
	assert.equal(dutyDateFor("night", lagos(FRI, "20:30")), FRI);
	assert.equal(dutyDateFor("night", lagos(SAT, "02:00")), FRI);
	assert.equal(dutyDateFor("night", lagos(SAT, "12:00")), null);
	assert.equal(signOutDutyFor("night", lagos(SAT, "08:50")), FRI);
	assert.equal(shiftHours("night", FRI), "20:30–08:30");
});

test("next opening: later today, or the next day at that day's hours", () => {
	assert.equal(nextShiftOpenAfter("afternoon", lagos(FRI, "09:00")).toISOString(), lagos(FRI, "12:30").toISOString());
	// Friday evening → Saturday opens at the weekend time.
	assert.equal(nextShiftOpenAfter("afternoon", lagos(FRI, "21:00")).toISOString(), lagos(SAT, "14:30").toISOString());
	assert.equal(nextShiftOpenAfter("afternoon", lagos(SUN, "21:00")).toISOString(), lagos("2026-10-19", "12:30").toISOString());
	assert.equal(shiftOpensAt("afternoon", SUN).toISOString(), lagos(SUN, "14:30").toISOString());
});

test("an afternoon time maps onto its own date; a night time may roll over", () => {
	assert.equal(instantForDuty("afternoon", FRI, 13 * 60).toISOString(), lagos(FRI, "13:00").toISOString());
	assert.equal(instantForDuty("night", FRI, 8 * 60).toISOString(), lagos(SAT, "08:00").toISOString());
	assert.equal(isWithinDuty("afternoon", FRI, lagos(FRI, "08:00")), false);
	assert.equal(isWithinDuty("afternoon", FRI, lagos(FRI, "13:00")), true);
	assert.equal(isWithinDuty("afternoon", SAT, lagos(SAT, "13:00")), false);
});

test("the register opens on the afternoon while it is running, else the night", () => {
	assert.equal(defaultShift(lagos(FRI, "13:00")), "afternoon");
	assert.equal(defaultShift(lagos(FRI, "10:00")), "night");
	assert.equal(defaultShift(lagos(FRI, "20:45")), "night");
	assert.equal(defaultShift(lagos(FRI, "20:45"), true), "afternoon");
	assert.equal(defaultShift(lagos(SAT, "13:00")), "night");
	assert.equal(activeDutyDate("afternoon", lagos(FRI, "20:50")), FRI);
	assert.equal(activeDutyDate("afternoon", lagos(FRI, "22:00")), null);
});

test("parseShift falls back to night for anything unknown", () => {
	assert.equal(parseShift("afternoon"), "afternoon");
	assert.equal(parseShift("AFTERNOON"), "night");
	assert.equal(parseShift(null), "night");
});
