import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { blankReport } from "./template.ts";
import { buildScheduleXlsxBuffer } from "./excel.ts";
import { SHEET_NAMES } from "./exportSchedule.ts";

test("styled workbook round-trips with 4 sheets, borders, and merges", async () => {
	const buf = await buildScheduleXlsxBuffer(blankReport({ date: "2026-07-20", outgoingOfficers: "Ada A" }));
	assert.ok(buf.length > 1000, "buffer should be a real xlsx");

	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
	assert.deepEqual(
		wb.worksheets.map((w) => w.name),
		[SHEET_NAMES.cover, SHEET_NAMES.summary, SHEET_NAMES.fraud, SHEET_NAMES.recs],
	);

	const ws = wb.getWorksheet(SHEET_NAMES.summary)!;
	// Header row (row 2) is bordered + filled.
	const header = ws.getCell(2, 1);
	assert.equal(header.border?.top?.style, "thin", "header cell should have a border");
	assert.ok(header.fill && (header.fill as ExcelJS.FillPattern).type === "pattern", "header cell should be filled");
	// Title row A1 is the master of a merge.
	assert.equal(ws.getCell("A1").isMerged, true, "title row should be merged");
	// A data cell also has a border.
	assert.equal(ws.getCell(3, 2).border?.left?.style, "thin");
});
