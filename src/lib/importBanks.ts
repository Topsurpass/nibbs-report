import type { MasterBank } from "./master";

/**
 * Pure parser for the 2-column bank upload.
 *
 * Column A is the combined label `"<Bank name> - <10-digit code>"` (the same
 * format the settlement HTML uses), column B is the posted collateral. We split
 * on the LAST " - " so bank names containing " - " survive, validate the code
 * is exactly 10 digits, and coerce the collateral off commas / a ₦ symbol.
 *
 * Kept free of `xlsx` so it is unit-testable on plain rows; `NibbsSettings`
 * feeds it `sheet_to_json(sheet, { header: 1 })`.
 */

const SEP = " - ";

export interface ParsedImport {
	banks: MasterBank[];
	/** Human-readable, 1-indexed row problems (skipped rows). */
	errors: string[];
}

function isEmptyRow(row: unknown[]): boolean {
	return (
		!row ||
		row.length === 0 ||
		row.every((c) => c === null || c === undefined || String(c).trim() === "")
	);
}

function parseCollateral(cell: unknown): number | null {
	if (cell === null || cell === undefined || String(cell).trim() === "") {
		return null;
	}
	if (typeof cell === "number") {
		return Number.isFinite(cell) ? Math.trunc(cell) : null;
	}
	const cleaned = String(cell)
		.replace(/[₦,\s]/g, "")
		.replace(/[^0-9.-]/g, "");
	if (cleaned === "" || cleaned === "-") return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseMasterFromRows(rows: unknown[][]): ParsedImport {
	const banks: MasterBank[] = [];
	const errors: string[] = [];
	const seen = new Set<string>();
	let dataRowsSeen = 0;

	rows.forEach((row, index) => {
		if (isEmptyRow(row)) return;
		const rowNo = index + 1;

		const label = String(row[0] ?? "").trim();
		const idx = label.lastIndexOf(SEP);

		// No " - <code>" separator: a header on the first data row is expected —
		// skip it quietly; anywhere else it's a malformed row.
		if (idx === -1) {
			if (dataRowsSeen === 0) return; // header line
			errors.push(`Row ${rowNo}: "${label}" has no " - <10-digit code>" suffix`);
			return;
		}

		dataRowsSeen++;

		const name = label.slice(0, idx).trim();
		const code = label.slice(idx + SEP.length).trim();

		if (!/^\d{10}$/.test(code)) {
			errors.push(`Row ${rowNo}: code "${code}" is not 10 digits`);
			return;
		}
		if (!name) {
			errors.push(`Row ${rowNo}: missing bank name before the code`);
			return;
		}

		const collateral = parseCollateral(row[1]);
		if (collateral === null) {
			errors.push(`Row ${rowNo}: collateral "${String(row[1] ?? "")}" is not a number`);
			return;
		}
		if (collateral < 0) {
			errors.push(`Row ${rowNo}: collateral cannot be negative`);
			return;
		}

		if (seen.has(code)) {
			errors.push(`Row ${rowNo}: duplicate code ${code} (last value kept)`);
		}
		seen.add(code);
		banks.push({ code, name, collateral });
	});

	return { banks, errors };
}

/**
 * Merge imported banks into an existing draft: upsert by code (import wins),
 * keep drafts not in the import. Order: existing order first, then new codes.
 */
export function mergeBanks(
	existing: MasterBank[],
	imported: MasterBank[],
): MasterBank[] {
	const importByCode = new Map(imported.map((b) => [b.code, b]));
	const merged: MasterBank[] = existing.map((b) =>
		importByCode.has(b.code) ? { ...importByCode.get(b.code)! } : b,
	);
	const existingCodes = new Set(existing.map((b) => b.code));
	for (const b of imported) {
		if (!existingCodes.has(b.code)) merged.push({ ...b });
	}
	return merged;
}
