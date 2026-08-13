import { NIP_BANK_CODES } from "./nipBankCodes.ts";
import type { Directory } from "./types.ts";

/**
 * The NIP institution directory the splitter resolves bank codes against.
 *
 * Two layers: the generated `NIP_BANK_CODES` snapshot of `bank_codes.xlsx`, and
 * operator overrides stored in `nibbs_nip_bank_codes`. Overrides win, so an
 * analyst can name a code NIBSS added after the snapshot (C62 / NOMBA FS) or
 * correct a stale name, without a deploy.
 */

export interface NipOverride {
	code: string;
	name: string;
}

/** Codes are matched case-insensitively; the directory is keyed upper-case. */
export function normalizeCode(raw: unknown): string {
	return String(raw ?? "")
		.trim()
		.toUpperCase();
}

/** A code is well-formed when it is exactly 3 alphanumeric characters. */
export function isCodeShaped(code: string): boolean {
	return /^[0-9A-Z]{3}$/.test(code);
}

/** Bundled snapshot merged with DB overrides (overrides win). */
export function mergeDirectory(overrides: NipOverride[] = []): Directory {
	const merged: Record<string, string> = { ...NIP_BANK_CODES };
	for (const o of overrides) {
		const code = normalizeCode(o.code);
		const name = String(o.name ?? "").trim();
		if (!isCodeShaped(code) || !name) continue;
		merged[code] = name;
	}
	return merged;
}

/** Bank name for a code, or "" when the directory does not know it. */
export function lookupBank(directory: Directory, raw: unknown): string {
	return directory[normalizeCode(raw)] ?? "";
}

export { NIP_BANK_CODES };
