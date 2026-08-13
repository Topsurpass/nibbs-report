import ExcelJS from "exceljs";
import { groupSheetName } from "./names.ts";
import { buildSheetGrid, buildSummaryGrid, type SheetGrid } from "./projectColumns.ts";
import { resolveHeaders } from "./projectColumns.ts";
import type { BankGroup, SplitOptions } from "./types.ts";

/**
 * Paints the pure grids from `./projectColumns.ts` into styled `.xlsx` books.
 *
 * Same split as `lib/schedule/exportSchedule.ts` -> `lib/schedule/excel.ts`: the
 * content model is library-free and unit-tested, this file only knows about
 * colours, borders and column widths. exceljs is used because the SheetJS build
 * the rest of the app reads with cannot write cell styles.
 */

const BORDER_COLOR = "FFCBD5E1"; // slate-300
const HEADER_FILL = "FF4F46E5"; // indigo-600
const UNMAPPED_FILL = "FFB45309"; // amber-700
const TOTAL_FILL = "FFF1F5F9"; // slate-100

const MONEY_FORMAT = "#,##0.00";

const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const boxBorder: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function fill(argb: string): ExcelJS.FillPattern {
	return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Width that fits the header and a sample of the data, within sane bounds. */
function columnWidths(grid: SheetGrid): Partial<ExcelJS.Column>[] {
	return grid.header.map((h, i) => {
		let width = h.length;
		for (let r = 0; r < Math.min(grid.rows.length, 200); r++) {
			width = Math.max(width, String(grid.rows[r][i] ?? "").length);
		}
		return { width: Math.min(Math.max(width + 2, 10), 42) };
	});
}

/** Write one grid onto a worksheet: header band, rows, totals, borders, freeze. */
function paint(ws: ExcelJS.Worksheet, grid: SheetGrid, headerFill: string) {
	ws.columns = columnWidths(grid);
	ws.addRow(grid.header);
	for (const row of grid.rows) ws.addRow(row);
	if (grid.totals) ws.addRow(grid.totals);

	const lastRow = ws.rowCount;
	const cols = grid.header.length;

	const header = ws.getRow(1);
	for (let c = 1; c <= cols; c++) {
		const cell = header.getCell(c);
		cell.fill = fill(headerFill);
		cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
		cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
	}
	header.height = 20;

	for (let r = 1; r <= lastRow; r++) {
		for (let c = 1; c <= cols; c++) ws.getCell(r, c).border = boxBorder;
	}

	if (grid.amountIndex > 0) {
		for (let r = 2; r <= lastRow; r++) {
			const cell = ws.getCell(r, grid.amountIndex);
			cell.numFmt = MONEY_FORMAT;
			cell.alignment = { horizontal: "right" };
		}
	}

	if (grid.totals) {
		const totals = ws.getRow(lastRow);
		for (let c = 1; c <= cols; c++) {
			totals.getCell(c).font = { bold: true };
			totals.getCell(c).fill = fill(TOTAL_FILL);
		}
	}

	// Header stays visible, and the analyst can slice the sheet without setup.
	ws.views = [{ state: "frozen", ySplit: 1 }];
	ws.autoFilter = {
		from: { row: 1, column: 1 },
		to: { row: Math.max(1, lastRow - (grid.totals ? 1 : 0)), column: cols },
	};
}

type GridOptions = Pick<SplitOptions, "columns" | "includeBankName">;

/** One bank's escalation workbook: a single sheet of its transactions. */
export function buildBankWorkbook(
	group: BankGroup,
	fileHeaders: string[],
	options: GridOptions,
	amountColumn: string | null,
): ExcelJS.Workbook {
	const wb = new ExcelJS.Workbook();
	wb.creator = "Audit Toolkit";
	wb.created = new Date();

	const grid = buildSheetGrid(group, fileHeaders, options, amountColumn);
	const ws = wb.addWorksheet(groupSheetName(group, new Set()));
	paint(ws, grid, group.unmapped ? UNMAPPED_FILL : HEADER_FILL);
	return wb;
}

/** The `00-Summary` workbook: one line per bank, plus the grand total. */
export function buildSummaryWorkbook(groups: BankGroup[]): ExcelJS.Workbook {
	const wb = new ExcelJS.Workbook();
	wb.creator = "Audit Toolkit";
	wb.created = new Date();

	const ws = wb.addWorksheet("Summary");
	paint(ws, buildSummaryGrid(groups), HEADER_FILL);
	return wb;
}

/**
 * Every bank in one book, one sheet each, led by the summary — the shape of the
 * `fraud_escalation.xls` Temz assembles by hand today.
 */
export function buildCombinedWorkbook(
	groups: BankGroup[],
	fileHeaders: string[],
	options: GridOptions,
	amountColumn: string | null,
): ExcelJS.Workbook {
	const wb = new ExcelJS.Workbook();
	wb.creator = "Audit Toolkit";
	wb.created = new Date();

	paint(wb.addWorksheet("Summary"), buildSummaryGrid(groups), HEADER_FILL);

	// One shared `taken` set: truncated 31-char sheet names collide, and a
	// collision here would silently drop a bank's tab.
	const taken = new Set<string>(["summary"]);
	for (const group of groups) {
		const ws = wb.addWorksheet(groupSheetName(group, taken));
		paint(ws, buildSheetGrid(group, fileHeaders, options, amountColumn), group.unmapped ? UNMAPPED_FILL : HEADER_FILL);
	}
	return wb;
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
	return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Headers actually written, for callers that need to report the selection. */
export function outputHeaders(fileHeaders: string[], options: GridOptions): string[] {
	return resolveHeaders(fileHeaders, options);
}
