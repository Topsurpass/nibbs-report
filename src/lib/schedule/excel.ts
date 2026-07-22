import ExcelJS from "exceljs";
import type { ScheduleReport } from "./template";
import { buildScheduleSheets, SHEET_NAMES } from "./exportSchedule.ts";

/**
 * Server-side styled workbook (borders, filled headers, merged spans) built with
 * exceljs — the SheetJS build the rest of the app uses can't write cell styles.
 * Consumes the pure `buildScheduleSheets` content model, then paints it. Used by
 * the export download route and the email-send route (both need a Buffer).
 */

const BORDER_COLOR = "FFCBD5E1"; // slate-300
const HEADER_FILL = "FF4F46E5"; // indigo-600
const TITLE_FILL = "FF0F172A"; // slate-900
const NOTE_COLOR = "FF6B7280"; // gray-500

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const boxBorder: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

type Cell = string | number;

function fill(argb: string): ExcelJS.FillPattern {
	return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Border every cell in the used rectangle (incl. cells inside merges). */
function borderGrid(ws: ExcelJS.Worksheet, rows: number, cols: number) {
	for (let r = 1; r <= rows; r++) {
		for (let c = 1; c <= cols; c++) {
			ws.getCell(r, c).border = boxBorder;
		}
	}
}

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number, cols: number, fillArgb = HEADER_FILL) {
	const row = ws.getRow(rowNumber);
	for (let c = 1; c <= cols; c++) {
		const cell = row.getCell(c);
		cell.fill = fill(fillArgb);
		cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
		cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
	}
	row.height = 20;
}

function addAoa(ws: ExcelJS.Worksheet, aoa: Cell[][]) {
	aoa.forEach((r) => ws.addRow(r));
}

export function buildScheduleWorkbook(report: ScheduleReport): ExcelJS.Workbook {
	const data = buildScheduleSheets(report);
	const wb = new ExcelJS.Workbook();
	wb.creator = "Audit Toolkit";

	// ---- Cover page ----
	const cover = wb.addWorksheet(SHEET_NAMES.cover, { properties: { defaultRowHeight: 18 } });
	cover.columns = [{ width: 30 }, { width: 34 }, { width: 52 }];
	addAoa(cover, data.cover);
	borderGrid(cover, data.cover.length, 3);
	for (let r = 1; r <= data.cover.length; r++) {
		cover.getCell(r, 1).font = { bold: true };
		cover.getCell(r, 3).font = { italic: true, color: { argb: NOTE_COLOR } };
		cover.getCell(r, 2).alignment = { wrapText: true, vertical: "middle" };
		cover.getCell(r, 3).alignment = { wrapText: true, vertical: "middle" };
	}

	// ---- Report Summary ----
	const summary = wb.addWorksheet(SHEET_NAMES.summary);
	summary.columns = [{ width: 22 }, { width: 20 }, { width: 42 }, { width: 42 }, { width: 24 }];
	addAoa(summary, data.summary.aoa);
	data.summary.merges.forEach((m) => summary.mergeCells(m));
	borderGrid(summary, data.summary.aoa.length, 5);
	// Title row.
	summary.getRow(1).height = 24;
	for (let c = 1; c <= 5; c++) {
		const cell = summary.getCell(1, c);
		cell.fill = fill(TITLE_FILL);
		cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
		cell.alignment = { vertical: "middle", horizontal: "center" };
	}
	// Header row + freeze.
	styleHeader(summary, 2, 5);
	summary.views = [{ state: "frozen", ySplit: 2 }];
	// Data rows: TASK bold + centered, wrap everything.
	for (let r = 3; r <= data.summary.aoa.length; r++) {
		summary.getCell(r, 1).font = { bold: true };
		summary.getCell(r, 1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
		summary.getCell(r, 3).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
		summary.getCell(r, 4).alignment = { vertical: "top", horizontal: "left", wrapText: true };
		summary.getCell(r, 5).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
	}

	// ---- Fraud Alerts ----
	const fraud = wb.addWorksheet(SHEET_NAMES.fraud);
	fraud.columns = [{ width: 16 }, { width: 20 }, { width: 34 }, { width: 14 }, { width: 16 }, { width: 22 }];
	addAoa(fraud, data.fraud);
	// Row 1 is a hint; border rows 2..end (the actual table).
	borderGrid(fraud, data.fraud.length, 6);
	fraud.getCell(1, 3).font = { italic: true, color: { argb: NOTE_COLOR } };
	styleHeader(fraud, 2, 6);
	for (let r = 3; r <= data.fraud.length; r++) {
		for (let c = 1; c <= 6; c++) fraud.getCell(r, c).alignment = { wrapText: true, vertical: "middle" };
	}

	// ---- Recommendations ----
	const recs = wb.addWorksheet(SHEET_NAMES.recs);
	recs.columns = [{ width: 8 }, { width: 64 }];
	addAoa(recs, data.recs);
	borderGrid(recs, data.recs.length, 2);
	recs.getCell(1, 2).font = { italic: true, color: { argb: NOTE_COLOR } };
	styleHeader(recs, 2, 2);
	for (let r = 3; r <= data.recs.length; r++) {
		recs.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };
		recs.getCell(r, 2).alignment = { wrapText: true, vertical: "middle" };
	}

	return wb;
}

/** Styled `.xlsx` as a Node Buffer (for download responses and email attachments). */
export async function buildScheduleXlsxBuffer(report: ScheduleReport): Promise<Buffer> {
	const wb = buildScheduleWorkbook(report);
	const out = await wb.xlsx.writeBuffer();
	return Buffer.from(out as ArrayBuffer);
}
