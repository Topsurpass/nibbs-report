import { extractCode } from "./detectColumns.ts";
import { isSuccessful, parseAmount } from "./parseRows.ts";
import type {
	BankGroup,
	CodeMode,
	DetectedColumns,
	Directory,
	GroupResult,
	Row,
} from "./types.ts";

/**
 * Routes every spooled row to its beneficiary bank.
 *
 * The one invariant that matters: **no row disappears.** Every input row ends up
 * in exactly one of `groups` (mapped or unmapped), `noCode`, or the
 * `filteredOut` count. A transaction that vanishes here is a transaction no bank
 * gets told to freeze, so `GroupResult` is built to be reconciled — the UI shows
 * the accounting and `verifyRowAccounting` asserts it.
 */

export interface GroupInput {
	rows: Row[];
	columns: DetectedColumns;
	directory: Directory;
	/** Override the detected code column (analyst picked one from the dropdown). */
	codeColumn?: string;
	codeMode?: CodeMode;
	successfulOnly?: boolean;
}

/** Sort: mapped banks by descending total (biggest exposure first), unmapped last. */
function compareGroups(a: BankGroup, b: BankGroup): number {
	if (a.unmapped !== b.unmapped) return a.unmapped ? 1 : -1;
	if (b.total !== a.total) return b.total - a.total;
	return a.code.localeCompare(b.code);
}

export function groupByBank({
	rows,
	columns,
	directory,
	codeColumn,
	codeMode,
	successfulOnly = false,
}: GroupInput): GroupResult {
	const column = codeColumn ?? columns.code?.column ?? "";
	const mode: CodeMode = codeMode ?? columns.code?.mode ?? "direct";
	const amountColumn = columns.amount;

	const byCode = new Map<string, BankGroup>();
	const noCode: Row[] = [];
	let filteredOut = 0;

	for (const row of rows) {
		if (successfulOnly && !isSuccessful(row, columns)) {
			filteredOut++;
			continue;
		}

		const code = column ? extractCode(row[column], mode) : "";
		if (!code) {
			noCode.push(row);
			continue;
		}

		let group = byCode.get(code);
		if (!group) {
			const name = directory[code] ?? "";
			group = { code, name, unmapped: !name, rows: [], total: 0 };
			byCode.set(code, group);
		}
		group.rows.push(row);
		if (amountColumn) group.total += parseAmount(row[amountColumn]);
	}

	const groups = [...byCode.values()].sort(compareGroups);
	const grandTotal = groups.reduce((sum, g) => sum + g.total, 0);

	return { groups, noCode, filteredOut, inputRows: rows.length, grandTotal };
}

/**
 * Row-accounting check: grouped + uncoded + filtered must equal the input.
 * Called by the eval harness and the tests; cheap enough to also run in the UI.
 */
export function verifyRowAccounting(result: GroupResult): boolean {
	const grouped = result.groups.reduce((n, g) => n + g.rows.length, 0);
	return grouped + result.noCode.length + result.filteredOut === result.inputRows;
}

/** Rows whose code resolved to a bank the directory does not know. */
export function unmappedCodes(result: GroupResult): BankGroup[] {
	return result.groups.filter((g) => g.unmapped);
}
