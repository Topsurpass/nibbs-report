// Corpus check for the fraud-escalation splitter.
//
// The gate tests in src/lib/escalation/*.test.ts run on synthetic fixtures,
// because the real spools carry live customer names, NUBANs and BVNs and are
// gitignored. This harness closes that gap: it runs the actual pipeline over
// whatever real files are on this machine and asserts the invariants that decide
// whether an escalation is safe to send.
//
//   npm run eval:escalation                  # every known file in the repo root
//   npm run eval:escalation -- path/to.xlsx  # a specific spool
//
// Exits non-zero if any invariant fails.

// Run with `--experimental-strip-types` (see the npm script) so the .ts modules
// below import directly — same source the app runs, no build step, no drift.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);

const DEFAULT_FILES = ["fraudulent.xlsx", "fraudulent_2.xlsx", "fraud_escalation.xls"];

/** Expectations verified by hand against the source data on 2026-08-13. */
const EXPECTED = {
	"fraudulent.xlsx": { codeColumn: "beneficiary_issuer_code", mode: "direct", banks: 9, unmapped: 0 },
	"fraudulent_2.xlsx": { codeColumn: "reciever", mode: "prefix", banks: 8, unmapped: 0 },
	"fraud_escalation.xls": { codeColumn: "beneficiary_issuer_code", mode: "direct", banks: 13, unmapped: 1 },
};

const { detectColumns } = await import("../src/lib/escalation/detectColumns.ts");
const { groupByBank, verifyRowAccounting, unmappedCodes } = await import(
	"../src/lib/escalation/groupByBank.ts"
);
const { mergeDirectory } = await import("../src/lib/escalation/nipDirectory.ts");
const { readSpool } = await import("../src/lib/escalation/readSpool.ts");
const { parseAmount, formatAmount } = await import("../src/lib/escalation/parseRows.ts");
const { extractCode } = await import("../src/lib/escalation/detectColumns.ts");

const directory = mergeDirectory();

let failures = 0;
const fail = (file, message) => {
	failures++;
	console.error(`  ✗ ${message}`);
};
const pass = (message) => console.log(`  ✓ ${message}`);

const targets = process.argv.slice(2);
const files = (targets.length > 0 ? targets : DEFAULT_FILES)
	.map((f) => (f.includes("/") ? f : fileURLToPath(new URL(f, root))))
	.filter((f) => {
		if (existsSync(f)) return true;
		console.log(`— skipping ${f} (not on this machine)`);
		return false;
	});

if (files.length === 0) {
	console.error("No spool files found. Put a real export in the repo root, or pass a path.");
	process.exit(1);
}

for (const path of files) {
	const name = path.split("/").pop();
	console.log(`\n=== ${name} ===`);

	const spool = readSpool(await readFile(path));
	const columns = detectColumns(spool.rows, spool.headers, directory);
	const result = groupByBank({ rows: spool.rows, columns, directory });

	console.log(
		`  ${spool.rows.length} rows · sheet "${spool.sheetName}" · column "${columns.code?.column ?? "NONE"}" (${columns.code?.mode ?? "-"}, ${Math.round((columns.code?.matchRate ?? 0) * 100)}%)`,
	);

	// --- Invariant 1: a code column was found at all.
	if (!columns.code) {
		fail(name, "no bank-code column detected");
		continue;
	}

	// --- Invariant 2: zero rows lost.
	const grouped = result.groups.reduce((n, g) => n + g.rows.length, 0);
	if (!verifyRowAccounting(result)) {
		fail(
			name,
			`row accounting: ${grouped} grouped + ${result.noCode.length} uncoded + ${result.filteredOut} filtered != ${result.inputRows} input`,
		);
	} else {
		pass(`row accounting balances (${grouped} grouped, ${result.noCode.length} uncoded)`);
	}

	// --- Invariant 3: every row sits in the group its own code names.
	let misrouted = 0;
	for (const group of result.groups) {
		for (const row of group.rows) {
			if (extractCode(row[columns.code.column], columns.code.mode) !== group.code) misrouted++;
		}
	}
	if (misrouted > 0) fail(name, `${misrouted} row(s) routed to the wrong bank`);
	else pass("every row matches its group's code");

	// --- Invariant 4: per-bank totals reconcile to the grand total.
	const summed = result.groups.reduce((n, g) => n + g.total, 0);
	if (Math.abs(summed - result.grandTotal) > 0.005) {
		fail(name, `totals drift: ${summed} vs ${result.grandTotal}`);
	} else {
		pass(`totals reconcile (${formatAmount(result.grandTotal)})`);
	}

	// --- Invariant 5: the split covers the file's own amount total.
	if (columns.amount) {
		const fileTotal = spool.rows.reduce((n, r) => n + parseAmount(r[columns.amount]), 0);
		const uncoded = result.noCode.reduce((n, r) => n + parseAmount(r[columns.amount]), 0);
		if (Math.abs(fileTotal - (result.grandTotal + uncoded)) > 0.005) {
			fail(name, `value leaked: file ${fileTotal}, split ${result.grandTotal + uncoded}`);
		} else {
			pass("no value leaked between file and split");
		}
	}

	// --- Invariant 6: the known-good expectations for this corpus.
	const want = EXPECTED[name];
	if (want) {
		if (columns.code.column !== want.codeColumn) {
			fail(name, `expected column "${want.codeColumn}", got "${columns.code.column}"`);
		} else if (columns.code.mode !== want.mode) {
			fail(name, `expected mode "${want.mode}", got "${columns.code.mode}"`);
		} else {
			pass(`column "${want.codeColumn}" (${want.mode}) as expected`);
		}

		if (result.groups.length !== want.banks) {
			fail(name, `expected ${want.banks} banks, got ${result.groups.length}`);
		} else {
			pass(`${want.banks} beneficiary banks as expected`);
		}

		const unmapped = unmappedCodes(result);
		if (unmapped.length !== want.unmapped) {
			fail(
				name,
				`expected ${want.unmapped} unmapped code(s), got ${unmapped.length} (${unmapped.map((u) => u.code).join(", ")})`,
			);
		} else {
			pass(`${want.unmapped} unmapped code(s) as expected`);
		}
	}

	console.log("  banks:");
	for (const g of result.groups) {
		console.log(
			`    ${g.unmapped ? "⚠ " : "  "}${(g.name || `UNMAPPED-${g.code}`).padEnd(38)} ${g.code}  ${String(g.rows.length).padStart(4)}  ${formatAmount(g.total).padStart(18)}`,
		);
	}
}

console.log(
	failures === 0
		? `\n✓ all invariants hold across ${files.length} file(s)`
		: `\n✗ ${failures} invariant failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
