// Regenerates src/lib/escalation/nipBankCodes.ts from bank_codes.xlsx.
//
// The NIP institution directory is reference data: a fixed 3-character code per
// bank. Bundling it as a TS constant keeps bank resolution deterministic, free,
// offline, and unit-testable — the DB is only consulted for operator overrides
// (codes NIBSS added after this snapshot, e.g. C62 / NOMBA FS).
//
//   node scripts/gen-nip-codes.mjs [path/to/bank_codes.xlsx]
//
// Re-run whenever NIBSS publishes a new directory, then commit the diff.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = new URL("..", import.meta.url);
const source = process.argv[2] ?? fileURLToPath(new URL("bank_codes.xlsx", root));
const target = fileURLToPath(new URL("src/lib/escalation/nipBankCodes.ts", root));

const wb = XLSX.read(readFileSync(source), { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false });

/** Column A is the bank name, column B the 3-char code (row 0 is the header). */
const entries = [];
const seen = new Set();
const problems = [];

rows.forEach((row, i) => {
	if (i === 0) return; // "BANK NAME" | "BANK CODE"
	const name = String(row?.[0] ?? "").trim();
	const code = String(row?.[1] ?? "").trim().toUpperCase();
	if (!name && !code) return;
	if (!/^[0-9A-Z]{3}$/.test(code)) {
		problems.push(`row ${i + 1}: code "${code}" is not 3 alphanumeric chars`);
		return;
	}
	if (!name) {
		problems.push(`row ${i + 1}: code ${code} has no bank name`);
		return;
	}
	if (seen.has(code)) {
		problems.push(`row ${i + 1}: duplicate code ${code} (first one kept)`);
		return;
	}
	seen.add(code);
	entries.push([code, name]);
});

if (problems.length > 0) {
	console.warn(`${problems.length} row problem(s):`);
	for (const p of problems) console.warn("  ·", p);
}
if (entries.length === 0) {
	console.error("No usable rows found — is this the right file?");
	process.exit(1);
}

entries.sort((a, b) => a[0].localeCompare(b[0]));

const body = entries.map(([code, name]) => `\t${code.match(/^\d/) ? `"${code}"` : code}: ${JSON.stringify(name)},`).join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Source: bank_codes.xlsx · Regenerate with: node scripts/gen-nip-codes.mjs
//
// The NIBSS NIP institution directory: 3-character institution code -> bank name.
// These are NOT the 10-digit settlement codes in \`nibbs_banks\` — different code
// space, different purpose. Operator additions/corrections live in the
// \`nibbs_nip_bank_codes\` table and are merged over this map at read time; see
// \`mergeDirectory\` in ./nipDirectory.ts.

export const NIP_BANK_CODES: Readonly<Record<string, string>> = Object.freeze({
${body}
});

/** Number of codes in the bundled snapshot (asserted in tests). */
export const NIP_BANK_CODE_COUNT = ${entries.length};
`;

writeFileSync(target, out, "utf8");
console.log(`✓ wrote ${entries.length} codes to ${target.replace(fileURLToPath(root), "")}`);
