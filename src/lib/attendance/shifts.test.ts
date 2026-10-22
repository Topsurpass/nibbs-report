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

test("weekday afternoon: sign-in open 12:00 up to (not including) 20:00", () => {
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "11:59")), null);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "12:00")), FRI);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "15:30")), FRI);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "19:59")), FRI);
	assert.equal(dutyDateFor("afternoon", lagos(FRI, "20:00")), null);
});

test("weekend afternoon opens at 14:00, not 12:00", () => {
	assert.equal(dutyDateFor("afternoon", lagos(SAT, "12:00")), null);
	assert.equal(dutyDateFor("afternoon", lagos(SAT, "13:59")), null);
	assert.equal(dutyDateFor("afternoon", lagos(SAT, "14:00")), SAT);
	assert.equal(dutyDateFor("afternoon", lagos(SUN, "19:30")), SUN);
	assert.equal(shiftHours("afternoon", SAT), "14:00–20:00");
	assert.equal(shiftHours("afternoon", FRI), "12:00–20:00");
});

test("afternoon sign-out allowed through a 30-minute grace, then shut", () => {
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "20:15")), FRI);
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "20:30")), FRI);
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "20:31")), null);
	assert.equal(signOutDutyFor("afternoon", lagos(FRI, "11:30")), null);
	assert.equal(shiftSignOutDeadline("afternoon", FRI).toISOString(), lagos(FRI, "20:30").toISOString());
	assert.equal(canSignOutDuty("afternoon", FRI, lagos(FRI, "11:59")), false);
});

test("night rules are unchanged by the shift layer", () => {
	assert.equal(dutyDateFor("night", lagos(FRI, "20:00")), FRI);
	assert.equal(dutyDateFor("night", lagos(SAT, "01:30")), FRI);
	assert.equal(dutyDateFor("night", lagos(SAT, "11:30")), null);
	assert.equal(signOutDutyFor("night", lagos(SAT, "08:20")), FRI);
	assert.equal(shiftHours("night", FRI), "20:00–08:00");
});

test("next opening: later today, or the next day at that day's hours", () => {
	assert.equal(nextShiftOpenAfter("afternoon", lagos(FRI, "08:30")).toISOString(), lagos(FRI, "12:00").toISOString());
	// Friday evening → Saturday opens at the weekend time.
	assert.equal(nextShiftOpenAfter("afternoon", lagos(FRI, "20:30")).toISOString(), lagos(SAT, "14:00").toISOString());
	assert.equal(nextShiftOpenAfter("afternoon", lagos(SUN, "20:30")).toISOString(), lagos("2026-10-19", "12:00").toISOString());
	assert.equal(shiftOpensAt("afternoon", SUN).toISOString(), lagos(SUN, "14:00").toISOString());
});

test("an afternoon time maps onto its own date; a night time may roll over", () => {
	assert.equal(instantForDuty("afternoon", FRI, 13 * 60).toISOString(), lagos(FRI, "13:00").toISOString());
	assert.equal(instantForDuty("night", FRI, 8 * 60).toISOString(), lagos(SAT, "08:00").toISOString());
	assert.equal(isWithinDuty("afternoon", FRI, lagos(FRI, "08:00")), false);
	assert.equal(isWithinDuty("afternoon", FRI, lagos(FRI, "13:00")), true);
	assert.equal(isWithinDuty("afternoon", SAT, lagos(SAT, "13:00")), false);
});

test("the register opens on the afternoon while it is running, else the night", () => {
	assert.equal(defaultShift(lagos(FRI, "12:30")), "afternoon");
	assert.equal(defaultShift(lagos(FRI, "09:30")), "night");
	assert.equal(defaultShift(lagos(FRI, "20:15")), "night");
	assert.equal(defaultShift(lagos(FRI, "20:15"), true), "afternoon");
	assert.equal(defaultShift(lagos(SAT, "12:30")), "night");
	assert.equal(activeDutyDate("afternoon", lagos(FRI, "20:20")), FRI);
	assert.equal(activeDutyDate("afternoon", lagos(FRI, "21:30")), null);
});

test("parseShift falls back to night for anything unknown", () => {
	assert.equal(parseShift("afternoon"), "afternoon");
	assert.equal(parseShift("AFTERNOON"), "night");
	assert.equal(parseShift(null), "night");
});
