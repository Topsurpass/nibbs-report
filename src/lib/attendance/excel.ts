import ExcelJS from "exceljs";
import { buildAttendanceExport, type Cell, type ExportInput, type SheetModel } from "./exportAttendance.ts";

/**
 * Server-side styled workbook for the night-duty register.
 *
 * Paints the pure model from `exportAttendance.ts` — this file decides only how
 * cells look, never what they say. Styling constants mirror
 * `lib/schedule/excel.ts` so both exports look like the same product.
 */

const BORDER_COLOR = "FFCBD5E1"; // slate-300
const HEADER_FILL = "FF4F46E5"; // indigo-600
const TITLE_COLOR = "FF0F172A"; // slate-900
const TOTAL_FILL = "FFEEF2FF"; // indigo-50
const NOTE_COLOR = "FF6B7280"; // gray-500

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const boxBorder: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function paint(wb: ExcelJS.Workbook, model: SheetModel) {
	const ws = wb.addWorksheet(model.name, { properties: { defaultRowHeight: 18 } });
	ws.columns = model.widths.map((width) => ({ width }));
	model.aoa.forEach((row: Cell[]) => ws.addRow(row));

	const cols = model.widths.length;

	// Title block above the table.
	ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: TITLE_COLOR } };
	for (let r = 2; r < model.headerRow; r++) {
		ws.getCell(r, 1).font = { italic: true, color: { argb: NOTE_COLOR } };
	}

	// Header row.
	const header = ws.getRow(model.headerRow);
	for (let c = 1; c <= cols; c++) {
		const cell = header.getCell(c);
		cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
		cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
		cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
	}
	header.height = 20;

	// Border the table body only — the title block stays clean.
	for (let r = model.headerRow; r <= model.aoa.length; r++) {
		for (let c = 1; c <= cols; c++) ws.getCell(r, c).border = boxBorder;
	}

	if (model.totalsRow) {
		const total = ws.getRow(model.totalsRow);
		for (let c = 1; c <= cols; c++) {
			total.getCell(c).font = { bold: true };
			total.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
		}
	}

	// Freeze the header so a long register stays readable while scrolling.
	ws.views = [{ state: "frozen", ySplit: model.headerRow }];
	ws.autoFilter = {
		from: { row: model.headerRow, column: 1 },
		to: { row: Math.max(model.headerRow, model.aoa.length), column: cols },
	};
	return ws;
}

export async function buildAttendanceXlsxBuffer(
	input: ExportInput,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
	const model = buildAttendanceExport(input);
	const wb = new ExcelJS.Workbook();
	wb.creator = "Audit Toolkit";
	wb.created = input.generatedAt;

	paint(wb, model.summary);
	paint(wb, model.nights);

	const buffer = await wb.xlsx.writeBuffer();
	return { buffer: buffer as ArrayBuffer, fileName: model.fileName };
}
