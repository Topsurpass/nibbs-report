/**
 * Shared types for the fraud-escalation splitter.
 *
 * Everything here is plain data so the same modules run in the browser (live
 * preview) and on the server (file generation). No Excel library, no I/O.
 */

/** A single spooled transaction: header name -> cell, as read by SheetJS. */
export type Row = Record<string, string>;

/** 3-char NIP institution code -> bank name. */
export type Directory = Readonly<Record<string, string>>;

/**
 * How a column carries the beneficiary bank code.
 * - `direct` — the cell *is* the code (`beneficiary_issuer_code` = "C39").
 * - `prefix` — the cell is a 13-char value whose first 3 chars are the code
 *   (`reciever` = "0113064018987" -> "011").
 */
export type CodeMode = "direct" | "prefix";

export interface CodeColumn {
	/** Header name exactly as it appears in the uploaded file. */
	column: string;
	mode: CodeMode;
	/** Share of non-empty cells that resolved to a known bank, 0..1. */
	matchRate: number;
	/** Non-empty cells inspected. */
	sampled: number;
}

export interface DetectedColumns {
	/** Best candidate, or null when nothing in the file looks like a bank code. */
	code: CodeColumn | null;
	/** Every viable candidate, best first — powers the override dropdown. */
	candidates: CodeColumn[];
	/** Header holding the transaction amount, if one was found. */
	amount: string | null;
	/** Header holding the response code, if one was found. */
	responseCode: string | null;
	/** Header holding the completion status, used when there is no response code. */
	completionStatus: string | null;
}

/** One beneficiary bank's slice of the upload. */
export interface BankGroup {
	/** 3-char NIP code, or the raw unresolved code for an unmapped group. */
	code: string;
	/** Resolved bank name, or "" when the code is unknown. */
	name: string;
	/** True when `code` is not in the directory — routed to an UNMAPPED bucket. */
	unmapped: boolean;
	rows: Row[];
	/** Sum of the amount column across `rows`. */
	total: number;
}

export interface GroupResult {
	groups: BankGroup[];
	/** Rows whose code cell was blank or malformed — never silently dropped. */
	noCode: Row[];
	/** Rows excluded by the "Successful only" filter. */
	filteredOut: number;
	/** Rows read from the file, before any filtering. */
	inputRows: number;
	/** Sum of every group's total. */
	grandTotal: number;
}

/** Everything the download route needs to rebuild exactly what was previewed. */
export interface SplitOptions {
	/** Header names to keep, in output order. Empty = keep everything. */
	columns: string[];
	/** Prepend a resolved "Beneficiary Bank" column. */
	includeBankName: boolean;
	/** Drop rows whose transaction did not succeed. */
	successfulOnly: boolean;
	/** Force a specific code column instead of the detected one. */
	codeColumn?: string;
	/** Mode for `codeColumn`; ignored when `codeColumn` is absent. */
	codeMode?: CodeMode;
}

/** The synthetic column prepended when `includeBankName` is on. */
export const BANK_NAME_COLUMN = "Beneficiary Bank";
