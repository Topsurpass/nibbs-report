// Paints the discrepancy report model into a styled .xlsx. Decides looks only;
// what each cell says comes from `discrepancyReport.ts`. Runs in the browser
// (exceljs is loaded on demand) so settlement data never leaves the machine,
// and in Node for tests.

import type ExcelJS from "exceljs";
import type { CellTone, DiscrepancyReport, ReportSheet, RowStyle } from "./discrepancyReport.ts";

const HEADER_FILL = "FF4F46E5"; // indigo-600
const GROUP_FILL = "FFE2E8F0"; // slate-200
const MISMATCH_FILL = "FFFEF2F2"; // red-50
const BAD_CELL_FILL = "FFFECACA"; // red-200
const TOTAL_FILL = "FFEEF2FF"; // indigo-50
const BORDER = "FFCBD5E1"; // slate-300
const TITLE = "FF0F172A"; // slate-900
const NOTE = "FF6B7280"; // gray-500

const TONE_FONT: Record<CellTone, string> = {
	bad: "FFB91C1C", // red-700
	good: "FF047857", // emerald-700
	warn: "FFB45309", // amber-700
	muted: "FF6B7280", // gray-500
};

const ROW_FILL: Partial<Record<RowStyle, string>> = {
	mismatch: MISMATCH_FILL,
	group: GROUP_FILL,
	total: TOTAL_FILL,
};

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function paintSheet(wb: ExcelJS.Workbook, sheet: ReportSheet) {
	const ws = wb.addWorksheet(sheet.name, { properties: { defaultRowHeight: 18 } });
	ws.columns = sheet.widths.map((width) => ({ width }));
	const cols = sheet.header.length;

	sheet.preamble.forEach((text, i) => {
		const cell = ws.getCell(i + 1, 1);
		cell.value = text;
		cell.font = i === 0 ? { bold: true, size: 14, color: { argb: TITLE } } : { italic: true, color: { argb: NOTE } };
		if (i === 1 && /^MISMATCH/.test(text)) cell.font = { bold: true, color: { argb: TONE_FONT.bad } };
		if (i === 1 && /^MATCH/.test(text)) cell.font = { bold: true, color: { argb: TONE_FONT.good } };
	});

	let r = sheet.preamble.length + 2;
	if (sheet.headerGroups) {
		for (const [label, from, to] of sheet.headerGroups) {
			ws.mergeCells(r, from, r, to);
			const cell = ws.getCell(r, from);
			cell.value = label;
			cell.font = { bold: true, color: { argb: TITLE } };
			cell.alignment = { horizontal: "center" };
			cell.fill = solid(TOTAL_FILL);
			cell.border = box;
		}
		r++;
	}

	const headerRow = r;
	sheet.header.forEach((h, c) => {
		const cell = ws.getCell(headerRow, c + 1);
		cell.value = h;
		cell.fill = solid(HEADER_FILL);
		cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
		cell.alignment = { vertical: "middle", wrapText: true };
		cell.border = box;
	});
	ws.getRow(headerRow).height = 22;

	for (const row of sheet.rows) {
		r++;
		const rowFill = ROW_FILL[row.style];
		if (row.style === "group") ws.mergeCells(r, 1, r, cols);
		row.cells.forEach((c, i) => {
			if (row.style === "group" && i > 0) return;
			const cell = ws.getCell(r, i + 1);
			cell.value = c.value;
			cell.border = box;
			cell.alignment = { vertical: "top", wrapText: !c.mono };
			cell.font = {
				name: c.mono ? "Consolas" : undefined,
				bold: c.bold || row.style === "group" || row.style === "total",
				color: c.tone ? { argb: TONE_FONT[c.tone] } : undefined,
			};
			if (c.tone === "bad" && row.style !== "group") cell.fill = solid(BAD_CELL_FILL);
			else if (rowFill) cell.fill = solid(rowFill);
		});
	}

	ws.views = [{ state: "frozen", ySplit: headerRow, xSplit: sheet.name === "Summary" ? 0 : 2 }];
	if (sheet.rows.length > 0 && sheet.name !== "Summary") {
		ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: r, column: cols } };
	}
	return ws;
}

/** Build the workbook bytes. `ExcelJSModule` is injected so the browser can load it lazily. */
export async function buildDiscrepancyXlsx(
	report: DiscrepancyReport,
	ExcelJSModule: typeof ExcelJS,
	generatedAt: Date,
): Promise<ArrayBuffer> {
	const wb = new ExcelJSModule.Workbook();
	wb.creator = "Audit Toolkit";
	wb.created = generatedAt;
	for (const sheet of report.sheets) paintSheet(wb, sheet);
	return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
