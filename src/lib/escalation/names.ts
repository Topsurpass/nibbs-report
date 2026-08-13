import type { BankGroup } from "./types.ts";

/**
 * Turns bank names into safe, unique Excel sheet names and file names.
 *
 * Excel caps sheet names at 31 characters and rejects `[ ] : * ? / \`; several
 * directory entries blow that budget ("Lagos Building Investment Company" is 33).
 * Truncation creates collisions, so both helpers de-duplicate against names
 * already issued — silently overwriting one bank's sheet with another's would
 * lose an escalation.
 */

const SHEET_NAME_LIMIT = 31;
const FILE_NAME_LIMIT = 80;

// Built with `new RegExp` rather than literals on purpose: a class like
// /[<>:"/\\|?*]/ puts an unescaped "/" next to a quote, which the TypeScript
// type-stripper mis-lexes into a different class — silently leaving path
// separators in file names. Explicit escapes remove the ambiguity.
const ILLEGAL_SHEET_CHARS = new RegExp("[\\[\\]:*?\\/\\\\]", "g");
const ILLEGAL_FILE_CHARS = new RegExp("[<>:\"\\/\\\\|?*\\x00-\\x1f]", "g");

/** Ensure `base` is unique within `taken`, trimming to fit `limit` if needed. */
function dedupe(base: string, taken: Set<string>, limit: number): string {
	if (!taken.has(base.toLowerCase())) {
		taken.add(base.toLowerCase());
		return base;
	}
	for (let n = 2; ; n++) {
		const suffix = ` (${n})`;
		const head = base.slice(0, Math.max(1, limit - suffix.length)).trimEnd();
		const candidate = `${head}${suffix}`;
		if (!taken.has(candidate.toLowerCase())) {
			taken.add(candidate.toLowerCase());
			return candidate;
		}
	}
}

/** Bank name -> a legal, unique worksheet name (<= 31 chars). */
export function safeSheetName(name: string, taken: Set<string>): string {
	const cleaned = name.replace(ILLEGAL_SHEET_CHARS, "-").replace(/\s+/g, " ").trim();
	const base = (cleaned || "Sheet").slice(0, SHEET_NAME_LIMIT).trimEnd();
	return dedupe(base, taken, SHEET_NAME_LIMIT);
}

/**
 * Bank name -> a legal, unique file-name stem (no extension).
 *
 * Spaces become underscores so the attachment survives mail clients that mangle
 * them, and leading dots/separators are stripped so a crafted bank name can
 * never write outside the archive.
 */
export function safeFileName(name: string, taken: Set<string>): string {
	const cleaned = name
		.replace(ILLEGAL_FILE_CHARS, "-")
		.replace(/\s+/g, "_")
		.replace(/^[._]+/, "")
		.replace(/[._]+$/, "")
		.trim();
	const base = (cleaned || "bank").slice(0, FILE_NAME_LIMIT).trimEnd();
	return dedupe(base, taken, FILE_NAME_LIMIT);
}

/**
 * Display label for a group: the bank name, or `UNMAPPED-<code>` when the
 * directory does not know the code. Unmapped rows still get their own file so
 * nothing is lost between upload and escalation.
 */
export function groupLabel(group: BankGroup): string {
	return group.unmapped ? `UNMAPPED-${group.code}` : group.name;
}

/** `<label> (<code>)` — the file/sheet identity a bank sees. */
export function groupFileStem(group: BankGroup): string {
	return `${groupLabel(group)} (${group.code})`;
}

/**
 * Worksheet name for a bank tab, guaranteeing the code survives.
 *
 * Naively truncating `groupFileStem` at 31 characters clips the tail, which is
 * exactly where the code lives — "United Bank for Africa Plc (033" loses the
 * bracket, and a longer name would lose the code entirely. Trimming the *name*
 * instead keeps the identifier that actually disambiguates the tab.
 */
export function groupSheetName(group: BankGroup, taken: Set<string>): string {
	const suffix = ` (${group.code})`;
	const room = SHEET_NAME_LIMIT - suffix.length;
	const label = groupLabel(group).replace(ILLEGAL_SHEET_CHARS, "-").replace(/\s+/g, " ").trim();
	const head = (label || "Bank").slice(0, Math.max(1, room)).trimEnd();
	return dedupe(`${head}${suffix}`, taken, SHEET_NAME_LIMIT);
}

/** `YYYY-MM-DD` in local time, for download file names. */
export function todayStamp(now: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
