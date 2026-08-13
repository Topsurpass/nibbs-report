import { groupLabel } from "./names.ts";
import { formatAmount, parseAmount } from "./parseRows.ts";
import { BANK_NAME_COLUMN, type BankGroup, type Row, type SplitOptions } from "./types.ts";

/**
 * Turns a bank's rows into the exact grid that gets written to its `.xlsx`:
 * the analyst's chosen columns, in the file's original order, optionally led by
 * a resolved "Beneficiary Bank" column, and closed by a totals row.
 *
 * Pure arrays-of-arrays — the exceljs painter in `./workbook.ts` styles this
 * without knowing anything about banks, the same split as
 * `lib/schedule/exportSchedule.ts` -> `lib/schedule/excel.ts`.
 */

export type Cell = string | number;

export interface SheetGrid {
	header: string[];
	rows: Cell[][];
	/** Totals row, or null when the file has no amount column to sum. */
	totals: Cell[] | null;
	/** 1-based index of the amount column within `header`, or 0 if absent. */
	amountIndex: number;
}

/**
 * Resolve the output header list: the file's own headers filtered to the
 * selection (original order preserved), with the synthetic bank-name column
 * prepended. An empty selection means "keep everything".
 */
export function resolveHeaders(
	fileHeaders: string[],
	options: Pick<SplitOptions, "columns" | "includeBankName">,
): string[] {
	const selected = new Set(options.columns);
	const kept =
		options.columns.length === 0
			? [...fileHeaders]
			: fileHeaders.filter((h) => selected.has(h));
	return options.includeBankName ? [BANK_NAME_COLUMN, ...kept] : kept;
}

/**
 * Amounts are written as real numbers, not the source's `" 4,990,000.00 "`
 * strings, so the receiving bank can sum the column in Excel. Every other cell
 * is passed through verbatim — this is evidence, not a report.
 */
function cellValue(row: Row, header: string, amountColumn: string | null): Cell {
	const raw = row[header] ?? "";
	if (amountColumn && header === amountColumn) return parseAmount(raw);
	return String(raw);
}

export function buildSheetGrid(
	group: BankGroup,
	fileHeaders: string[],
	options: Pick<SplitOptions, "columns" | "includeBankName">,
	amountColumn: string | null,
): SheetGrid {
	const header = resolveHeaders(fileHeaders, options);
	const label = groupLabel(group);

	const rows: Cell[][] = group.rows.map((row) =>
		header.map((h) => (h === BANK_NAME_COLUMN ? label : cellValue(row, h, amountColumn))),
	);

	const amountIndex = amountColumn ? header.indexOf(amountColumn) + 1 : 0;
	const totals =
		amountIndex > 0
			? header.map((_, i) => {
					if (i === amountIndex - 1) return group.total;
					return i === 0 ? `TOTAL (${group.rows.length})` : "";
				})
			: null;

	return { header, rows, totals, amountIndex };
}

/** The `00-Summary` grid: one line per bank plus a grand total. */
export function buildSummaryGrid(groups: BankGroup[]): SheetGrid {
	const header = ["Beneficiary Bank", "Code", "Transactions", "Total Amount"];
	const rows: Cell[][] = groups.map((g) => [
		groupLabel(g),
		g.code,
		g.rows.length,
		g.total,
	]);
	const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
	const totalAmount = groups.reduce((n, g) => n + g.total, 0);
	return {
		header,
		rows,
		totals: [`TOTAL (${groups.length} banks)`, "", totalRows, totalAmount],
		amountIndex: 4,
	};
}

/** One-line description of a group for the on-screen table. */
export function describeGroup(group: BankGroup): string {
	const n = group.rows.length;
	return `${n} transaction${n === 1 ? "" : "s"} · ${formatAmount(group.total)}`;
}
