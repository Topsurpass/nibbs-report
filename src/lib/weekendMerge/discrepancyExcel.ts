// Paints the discrepancy report model into a styled .xlsx. Decides looks only;
// what each cell says comes from `discrepancyReport.ts`. Runs in the browser
// (exceljs is loaded on demand) so settlement data never leaves the machine,
// and in Node for tests.

import type ExcelJS from "exceljs";
import type { CellTone, DiscrepancyReport, ReportSheet, RowStyle } from "./discrepancyReport.ts";

const HEADER_FILL = "FF4F46E5"; // indigo-600
const GROUP_FILL = "FFE2E8F0"; // slate-200
const PROBLEM_FILL = "FFFEF2F2"; // red-50
const BAD_CELL_FILL = "FFFECACA"; // red-200
const GOOD_CELL_FILL = "FFDCFCE7"; // green-100
const BORDER = "FFCBD5E1"; // slate-300
const TITLE = "FF0F172A"; // slate-900
const NOTE = "FF6B7280"; // gray-500

const TONE_FONT: Record<CellTone, string> = {
	bad: "FFB91C1C", // red-700
	good: "FF047857", // emerald-700
	warn: "FFB45309", // amber-700
	muted: "FF6B7280", // gray-500
};

const ROW_FILL: Partial<Record<RowStyle, string>> = { problem: PROBLEM_FILL, group: GROUP_FILL };

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function paintSheet(wb: ExcelJS.Workbook, sheet: ReportSheet) {
	const ws = wb.addWorksheet(sheet.name, { properties: { defaultRowHeight: 18 } });
	ws.columns = sheet.widths.map((width) => ({ width }));

	sheet.preamble.forEach((text, i) => {
		const cell = ws.getCell(i + 1, 1);
		cell.value = text;
		if (i === 0) cell.font = { bold: true, size: 15, color: { argb: TITLE } };
		else if (i === 1 && sheet.verdictTone) cell.font = { bold: true, size: 13, color: { argb: TONE_FONT[sheet.verdictTone] } };
		else cell.font = { italic: true, color: { argb: NOTE } };
	});

	let r = sheet.preamble.length + 1;
	let firstHeader = 0;
	for (const table of sheet.tables) {
		const cols = table.header.filter((h) => h !== "").length || table.header.length;
		r++;
		if (table.title) {
			r++;
			const t = ws.getCell(r, 1);
			t.value = table.title;
			t.font = { bold: true, size: 12, color: { argb: TITLE } };
			r++;
		}
		const headerRow = r;
		if (!firstHeader) firstHeader = headerRow;
		table.header.slice(0, cols).forEach((h, c) => {
			const cell = ws.getCell(headerRow, c + 1);
			cell.value = h;
			cell.fill = solid(HEADER_FILL);
			cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
			cell.alignment = { vertical: "middle" };
			cell.border = box;
		});
		ws.getRow(headerRow).height = 22;

		for (const row of table.rows) {
			r++;
			if (row.style === "group") {
				ws.mergeCells(r, 1, r, cols);
				const cell = ws.getCell(r, 1);
				cell.value = row.cells[0].value;
				cell.font = { bold: true, color: { argb: TITLE } };
				cell.fill = solid(GROUP_FILL);
				cell.border = box;
				continue;
			}
			row.cells.slice(0, cols).forEach((c, i) => {
				const cell = ws.getCell(r, i + 1);
				cell.value = c.value;
				cell.border = box;
				cell.alignment = { vertical: "top", wrapText: true };
				cell.font = {
					name: c.mono ? "Consolas" : undefined,
					bold: c.bold,
					color: c.tone ? { argb: TONE_FONT[c.tone] } : undefined,
				};
				if (c.tone === "bad" && row.style === "problem") cell.fill = solid(BAD_CELL_FILL);
				else if (c.tone === "good" && row.style === "problem") cell.fill = solid(GOOD_CELL_FILL);
				else if (ROW_FILL[row.style]) cell.fill = solid(ROW_FILL[row.style]!);
			});
		}
	}

	ws.views = [{ state: "frozen", ySplit: firstHeader }];
	ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
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
