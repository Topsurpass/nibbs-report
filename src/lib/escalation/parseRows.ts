import type { DetectedColumns, Row } from "./types.ts";

/**
 * Cell-level readers for the spooled transaction rows.
 *
 * Amounts arrive in every shape the source systems emit: `" 4,990,000.00 "`,
 * `"4990000.00"`, `"4990000"`, and occasionally with a ₦. Response codes are
 * `"00"` in one export and `"0"` in another, so success is "all zeros", not a
 * string equality check.
 */

/**
 * Money as a number, keeping decimals. Returns 0 for blanks and junk so a bad
 * cell can never poison a bank's total with NaN.
 *
 * Deliberately not `parseCollateral` from `src/lib/importBanks.ts` — that one
 * truncates to whole Naira, which is right for collateral and wrong here.
 */
export function parseAmount(cell: unknown): number {
	if (typeof cell === "number") return Number.isFinite(cell) ? cell : 0;
	const raw = String(cell ?? "").trim();
	if (!raw) return 0;
	const cleaned = raw.replace(/[₦,\s]/g, "").replace(/[^0-9.-]/g, "");
	if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : 0;
}

/** Naira with thousands separators and 2dp, for on-screen totals. */
export function formatAmount(value: number): string {
	return value.toLocaleString("en-NG", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

/**
 * Did the transfer actually land? A response code of all zeros ("0", "00")
 * means success; anything else ("97" timeout, "61" limit, "57" not permitted)
 * is a failure. Falls back to `completion_status == 1` when the export carries
 * no response code, and treats a row with neither signal as successful so an
 * unknown export shape never silently hides transactions.
 */
export function isSuccessful(row: Row, columns: DetectedColumns): boolean {
	if (columns.responseCode) {
		const code = String(row[columns.responseCode] ?? "").trim();
		if (code) return /^0+$/.test(code);
	}
	if (columns.completionStatus) {
		const status = String(row[columns.completionStatus] ?? "").trim();
		if (status) return status === "1" || /^(true|success|successful)$/i.test(status);
	}
	return true;
}
