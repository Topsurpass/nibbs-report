import { isCodeShaped, normalizeCode } from "./nipDirectory.ts";
import type { CodeColumn, CodeMode, DetectedColumns, Directory, Row } from "./types.ts";

/**
 * Works out which column carries the beneficiary bank code — by looking at the
 * *values*, not the header, because the headers lie: in `fraudulent_2.xlsx` the
 * 13-char code lives in `reciever` (sic) while `destination` is a bare 10-digit
 * account number.
 *
 * The dangerous failure this module exists to prevent: `fraud_escalation.xls`
 * carries BOTH `beneficiary_issuer_code` and `initiator_issuer_code`, and both
 * resolve cleanly against the directory. Choosing the initiator column would
 * escalate every transaction to the *sending* bank — wrong bank, wrong account,
 * silently. Header hints therefore outweigh match rate, and a column that looks
 * like the sender is never auto-selected: the analyst must pick it deliberately.
 */

/**
 * A candidate must clear two independent bars:
 *
 * - `MIN_SHAPE_RATE` — nearly every cell must have the right *shape* for the
 *   mode (3 chars, or 13 chars). This is what rejects `destination`, whose
 *   10-digit account numbers are the wrong length.
 * - `MIN_RESOLVE_RATE` — at least half must actually name a bank. This is what
 *   rejects `currency`, whose "NGN" is perfectly code-shaped but resolves to
 *   nothing.
 *
 * Resolution is the looser bar on purpose. A real `beneficiary_issuer_code`
 * column full of codes NIBSS added after our snapshot (C62 / NOMBA FS) must
 * still be recognised as the code column — those rows belong in UNMAPPED
 * buckets the analyst can name, not in a file where detection gave up entirely.
 */
const MIN_SHAPE_RATE = 0.9;
const MIN_RESOLVE_RATE = 0.5;

/** Cap the scan on very large spools; a sample this size is decisive. */
const MAX_SAMPLE = 5000;

/** Length of the composite "<3-char code><10-digit account>" value. */
const PREFIXED_LENGTH = 13;

const BENEFICIARY_HINT = /benefic|receiv|reciev|destination|payee|credit/i;
const INITIATOR_HINT = /initiator|sender|originat|payer|debit|source/i;

/** Header -> comparable key: lower-cased, punctuation removed. */
export function normalizeHeader(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Excel silently turns a text code like "044" into the number 44, so a cell may
 * arrive one character short. Restore that single zero for all-digit values;
 * leave anything containing a letter (C39, B99) alone.
 *
 * Exactly one character, never more: no institution code in the directory
 * begins with "00", so at most one leading zero can ever be lost. Padding more
 * aggressively would let a 12-digit account number pad up to 13 and hand back a
 * bogus 3-char prefix.
 */
function restoreLeadingZeros(value: string, width: number): string {
	if (width - value.length !== 1) return value;
	if (!/^\d+$/.test(value)) return value;
	return `0${value}`;
}

/** The bank code a cell yields under `mode`, or "" when it yields none. */
export function extractCode(cell: unknown, mode: CodeMode): string {
	const raw = normalizeCode(cell);
	if (!raw) return "";
	if (mode === "direct") {
		const code = restoreLeadingZeros(raw, 3);
		return isCodeShaped(code) ? code : "";
	}
	const padded = restoreLeadingZeros(raw, PREFIXED_LENGTH);
	// The exact length is what rejects a 10-digit account number whose first
	// three digits happen to collide with a real institution code.
	if (padded.length !== PREFIXED_LENGTH) return "";
	const code = padded.slice(0, 3);
	return isCodeShaped(code) ? code : "";
}

function scoreColumn(
	rows: Row[],
	column: string,
	mode: CodeMode,
	directory: Directory,
): CodeColumn | null {
	let sampled = 0;
	let shaped = 0;
	let resolved = 0;
	for (const row of rows) {
		if (sampled >= MAX_SAMPLE) break;
		const cell = String(row[column] ?? "").trim();
		if (!cell) continue;
		sampled++;
		const code = extractCode(cell, mode);
		if (!code) continue;
		shaped++;
		if (directory[code]) resolved++;
	}
	if (sampled === 0) return null;
	if (shaped / sampled < MIN_SHAPE_RATE) return null;
	const matchRate = resolved / sampled;
	if (matchRate < MIN_RESOLVE_RATE) return null;
	return { column, mode, matchRate, sampled };
}

/**
 * Ranking score. Header intent dominates match rate on purpose — a beneficiary
 * column that resolves 85% still beats an initiator column that resolves 100%.
 */
function rank(candidate: CodeColumn): number {
	let score = candidate.matchRate;
	if (BENEFICIARY_HINT.test(candidate.column)) score += 1;
	if (INITIATOR_HINT.test(candidate.column)) score -= 2;
	// A cell that *is* the code beats one the code has to be sliced out of.
	if (candidate.mode === "direct") score += 0.25;
	return score;
}

/** True when the header names the sender side — never auto-select these. */
export function looksLikeInitiator(column: string): boolean {
	return INITIATOR_HINT.test(column) && !BENEFICIARY_HINT.test(column);
}

function findHeader(headers: string[], test: (key: string) => boolean): string | null {
	for (const h of headers) {
		if (test(normalizeHeader(h))) return h;
	}
	return null;
}

/** Amount column: exact "amount" first, then anything containing it. */
export function detectAmountColumn(headers: string[]): string | null {
	return (
		findHeader(headers, (k) => k === "amount") ??
		findHeader(headers, (k) => k.includes("amount")) ??
		null
	);
}

export function detectResponseCodeColumn(headers: string[]): string | null {
	return findHeader(headers, (k) => k.includes("respcode") || k.includes("responsecode"));
}

export function detectCompletionStatusColumn(headers: string[]): string | null {
	return (
		findHeader(headers, (k) => k.includes("completionstatus")) ??
		findHeader(headers, (k) => k === "status") ??
		null
	);
}

/**
 * Inspect every column and report the best bank-code carrier plus all viable
 * alternatives (best first) for the override dropdown.
 */
export function detectColumns(
	rows: Row[],
	headers: string[],
	directory: Directory,
): DetectedColumns {
	const amount = detectAmountColumn(headers);
	const responseCode = detectResponseCodeColumn(headers);
	const completionStatus = detectCompletionStatusColumn(headers);

	// A column cannot be both the amount and the bank code. Excluding the
	// already-identified columns stops a 3-digit amount or status value from
	// coinciding with a real institution code and hijacking detection.
	const reserved = new Set([amount, responseCode, completionStatus].filter(Boolean) as string[]);

	const candidates: CodeColumn[] = [];
	for (const column of headers) {
		if (reserved.has(column)) continue;
		// Direct wins over prefix for the same column: if the cell already is a
		// valid code there is nothing to slice.
		const direct = scoreColumn(rows, column, "direct", directory);
		const found = direct ?? scoreColumn(rows, column, "prefix", directory);
		if (found) candidates.push(found);
	}

	candidates.sort((a, b) => rank(b) - rank(a));

	// Never auto-select a sender-side column — that would escalate to the wrong
	// bank without anyone noticing. Offer it in the dropdown, but make the
	// analyst choose it on purpose.
	const best = candidates[0];
	const code = best && !looksLikeInitiator(best.column) ? best : null;

	return { code, candidates, amount, responseCode, completionStatus };
}
