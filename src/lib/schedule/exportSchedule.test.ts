import { test } from "node:test";
import assert from "node:assert/strict";
import { blankReport } from "./template.ts";
import {
	buildScheduleSheets,
	buildScheduleWorkbook,
	coverDate,
	ddmmyyyy,
	scheduleFileName,
	SHEET_NAMES,
	shiftSlug,
} from "./exportSchedule.ts";

test("date + shift helpers", () => {
	assert.equal(coverDate("2026-07-20"), "20/7/2026");
	assert.equal(ddmmyyyy("2026-07-20"), "20072026");
	assert.equal(shiftSlug("Afternoon to Night"), "Afternoon_Night");
	assert.equal(shiftSlug("Morning to Afternoon"), "Morning_Afternoon");
});

test("cover sheet has the 8 template rows in order", () => {
	const { cover } = buildScheduleSheets(blankReport({ date: "2026-07-20", outgoingOfficers: "Ada A" }));
	assert.equal(cover.length, 8);
	assert.deepEqual(cover[0], ["Department", "Internal Audit (Frauddesk Unit)", ""]);
	assert.equal(cover[1][1], "☐ Afternoon to Night");
	assert.equal(cover[2][1], "20/7/2026");
	assert.equal(cover[3][1], "Ada A"); // outgoing officer
	assert.equal(cover[6][0], "Outgoing Officer’s Signature");
});

test("summary sheet: title, header, and merged category spans", () => {
	const { summary } = buildScheduleSheets(blankReport({ date: "2026-07-20" }));
	assert.deepEqual(summary.aoa[0], ["DAILY SCHEDULE REPORT", "", "", "", ""]);
	assert.deepEqual(summary.aoa[1], ["TASK", "Details", "Description", "SUMMARY/FINDINGS", "Status"]);
	// MONITORING (7 rows) starts at Excel row 3 -> spans 3..9.
	assert.ok(summary.merges.includes("A1:E1"));
	assert.ok(summary.merges.includes("A3:A9"), `merges: ${summary.merges.join(",")}`);
	assert.ok(summary.merges.includes("C3:C9"));
	// The TASK label sits only on the category's first row; others blank.
	assert.equal(summary.aoa[2][0], "MONITORING");
	assert.equal(summary.aoa[3][0], "");
	assert.equal(summary.aoa[2][1], "Mobile Transfer");
});

test("single-row category is not merged", () => {
	const report = blankReport({ date: "2026-07-20" });
	// NIBSS has a single row -> no merge for it.
	const { summary } = buildScheduleSheets(report);
	const monitoringRows = 7, toolsRows = 4, fraudRegRows = 2, complaintsRows = 2;
	const nibssTop = 3 + monitoringRows + toolsRows + fraudRegRows + complaintsRows; // Excel row
	assert.ok(!summary.merges.includes(`A${nibssTop}:A${nibssTop}`));
});

test("fraud + recommendations sheets", () => {
	const { fraud, recs } = buildScheduleSheets(blankReport({ date: "2026-07-20" }));
	assert.equal(fraud[0][2], "Use this to log any fraud incidents detected.");
	assert.deepEqual(fraud[1], ["Time Logged", "Case Reference/ID", "Description", "Status", "Escalated To", "Remarks"]);
	assert.deepEqual(recs[1], ["S/N", "Recommendation Items"]);
	assert.equal(recs[2][0], 1); // numbered
});

test("workbook has the 4 named sheets and summary merges applied", () => {
	const wb = buildScheduleWorkbook(blankReport({ date: "2026-07-20" }));
	assert.deepEqual(wb.SheetNames, [
		SHEET_NAMES.cover,
		SHEET_NAMES.summary,
		SHEET_NAMES.fraud,
		SHEET_NAMES.recs,
	]);
	const ws = wb.Sheets[SHEET_NAMES.summary];
	assert.ok(ws["!merges"] && ws["!merges"].length >= 3, "summary should carry merges");
});

test("filename encodes date + shift", () => {
	assert.equal(
		scheduleFileName(blankReport({ date: "2026-07-20" })),
		"DAILY_SCHEDULE_REPORT_20072026_Afternoon_Night.xlsx",
	);
});
