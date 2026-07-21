import { test } from "node:test";
import assert from "node:assert/strict";
import { blankReport, CATEGORY_PRESETS, defaultSummary } from "./template.ts";
import {
	buildScheduleSheets,
	coverDate,
	ddmmyyyy,
	scheduleFileName,
	shiftSlug,
} from "./exportSchedule.ts";

test("date + shift helpers", () => {
	assert.equal(coverDate("2026-07-20"), "20/7/2026");
	assert.equal(ddmmyyyy("2026-07-20"), "20072026");
	assert.equal(shiftSlug("Afternoon to Night"), "Afternoon_Night");
	assert.equal(shiftSlug("Morning to Afternoon"), "Morning_Afternoon");
});

test("default summary is MONITORING, Fraud Complaints, NIBSS", () => {
	assert.deepEqual(
		defaultSummary().map((c) => c.task),
		["MONITORING", "Fraud Complaints", "NIBSS"],
	);
	assert.deepEqual(
		CATEGORY_PRESETS.map((p) => p.label),
		["Tools Health", "Fraud Register Update", "Other Requests"],
	);
});

test("cover sheet joins officer arrays", () => {
	const report = blankReport({ date: "2026-07-20", outgoingOfficers: "Ada A" });
	report.cover.outgoingOfficers = ["Ada A", "Bola B"];
	report.cover.incomingOfficers = ["Seyi S"];
	const { cover } = buildScheduleSheets(report);
	assert.equal(cover.length, 8);
	assert.deepEqual(cover[0], ["Department", "Internal Audit (Frauddesk Unit)", ""]);
	assert.equal(cover[1][1], "☐ Afternoon to Night");
	assert.equal(cover[3][1], "Ada A, Bola B"); // outgoing officers joined
	assert.equal(cover[4][1], "Seyi S"); // incoming
	assert.equal(cover[6][0], "Outgoing Officer’s Signature");
});

test("summary sheet: title, header, and merged category spans", () => {
	const { summary } = buildScheduleSheets(blankReport({ date: "2026-07-20", outgoingOfficers: "X" }));
	assert.deepEqual(summary.aoa[0], ["DAILY SCHEDULE REPORT", "", "", "", ""]);
	assert.deepEqual(summary.aoa[1], ["TASK", "Details", "Description", "SUMMARY/FINDINGS", "Status"]);
	// MONITORING (7 rows) starts at Excel row 3 -> spans 3..9.
	assert.ok(summary.merges.includes("A1:E1"));
	assert.ok(summary.merges.includes("A3:A9"), `merges: ${summary.merges.join(",")}`);
	assert.ok(summary.merges.includes("C3:C9"));
	assert.equal(summary.aoa[2][0], "MONITORING");
	assert.equal(summary.aoa[3][0], "");
	assert.equal(summary.aoa[2][1], "Mobile Transfer");
});

test("single-row category (NIBSS) is not merged", () => {
	const { summary } = buildScheduleSheets(blankReport({ date: "2026-07-20", outgoingOfficers: "X" }));
	// header rows 1-2, MONITORING 3-9 (7), Fraud Complaints 10-11 (2), NIBSS row 12 (1).
	const nibssTop = 12;
	assert.ok(!summary.merges.includes(`A${nibssTop}:A${nibssTop}`));
});

test("fraud + recommendations sheets", () => {
	const { fraud, recs } = buildScheduleSheets(blankReport({ date: "2026-07-20", outgoingOfficers: "X" }));
	assert.equal(fraud[0][2], "Use this to log any fraud incidents detected.");
	assert.deepEqual(fraud[1], ["Time Logged", "Case Reference/ID", "Description", "Status", "Escalated To", "Remarks"]);
	assert.deepEqual(recs[1], ["S/N", "Recommendation Items"]);
	assert.equal(recs[2][0], 1);
});

test("filename encodes date + shift", () => {
	assert.equal(
		scheduleFileName(blankReport({ date: "2026-07-20", outgoingOfficers: "X" })),
		"DAILY_SCHEDULE_REPORT_20072026_Afternoon_Night.xlsx",
	);
});
