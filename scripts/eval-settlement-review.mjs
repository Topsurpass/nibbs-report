// Corpus check for the Settlement Audit "What to fix" review.
//
// The gate tests in src/lib/settlementAudit/review.test.ts use synthetic files.
// This runs the review over the real ETRANZACT_*.txt files on this machine
// (gitignored, never committed). The Frame HTML parser needs a browser DOM, so
// each file's Frame report is built from the file's own rows: the pair agrees
// by construction, and every planted error must be found.
//   1. Clean pairs: every valid real file yields zero problems, and reconcile()
//      fails no check the review would have to explain.
//   2. Mutation fuzz: seeded single mutations of real files (amount digit, a
//      TAB turned into a space, a wrong date, a mistyped bank code, a dropped
//      line, a repeated line, a wrong session in the name) must each yield
//      exactly ONE problem, of the right kind, at the right line.
//   3. Consistency: on every mutation, each non-collateral check reconcile()
//      fails is matched by at least one problem in the review.
//
//   npm run eval:settlement-review
//   npm run eval:settlement-review -- path/to/dir
//   EVAL_MUTATIONS=3000 npm run eval:settlement-review
//
// Exits non-zero if any invariant fails. Pass threshold: 100% (deterministic).

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const { findAuditProblems, buildAuditReview } = await import("../src/lib/settlementAudit/review.ts");
const { parseEtranzactTxt, validateTxtFilename } = await import("../src/lib/parseTxt.ts");
const { reconcile } = await import("../src/lib/reconcile.ts");
const { DEFAULT_MASTER } = await import("../src/lib/master.ts");
const { LEGACY_BANK_CODE_MERGES } = await import("../src/lib/legacyBankCodes.ts");

const dir = process.argv[2] ?? join(homedir(), "Downloads", "Nibbs Portal");
const MUTATIONS = Number(process.env.EVAL_MUTATIONS ?? 700);

let failures = 0;
const fail = (m) => {
	failures++;
	console.error(`  ✗ ${m}`);
};
const pass = (m) => console.log(`  ✓ ${m}`);

if (!existsSync(dir)) {
	console.error(`No corpus at ${dir}. Pass a folder of ETRANZACT_*.txt files.`);
	process.exit(1);
}
const names = readdirSync(dir).filter((n) => /^ETRANZACT_\d{8}_[1-4]\.txt$/.test(n)).sort();
const LETTER = ["A", "B", "C", "D"];

/** A real file plus the Frame report and inputs that agree with it. */
async function load(name) {
	const text = await readFile(join(dir, name), "utf8");
	const txt = parseEtranzactTxt(text);
	const [, dd, mm, yyyy, n] = name.match(/^ETRANZACT_(\d{2})(\d{2})(\d{4})_(\d)\.txt$/);
	const reportDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
	const known = new Set(DEFAULT_MASTER.map((m) => m.code));
	const master = [...DEFAULT_MASTER, ...txt.rows.filter((r) => !known.has(r.code)).map((r) => ({ code: r.code, name: `Bank ${r.code}`, collateral: 0 }))];
	const frame = {
		rows: txt.rows.map((r) => ({ bankString: `${r.code}`, name: master.find((m) => m.code === r.code).name, code: r.code, outgoing: 0, incoming: r.amount, netPosition: r.amount })),
		netSum: txt.rows.reduce((s, r) => s + r.amount, 0),
		droppedEmpty: 0,
		droppedPocketMoni: 0,
	};
	return { name, text, txt, input: { txtText: text, txtName: name, frame, htmlName: `${yyyy}-${mm}-${dd} ${LETTER[Number(n) - 1]}.html`, master, reportDate } };
}

function failingChecks(input) {
	const r = reconcile({
		frame: input.frame,
		txt: parseEtranzactTxt(input.txtText),
		master: input.master,
		reportDate: input.reportDate,
		filenameCheck: validateTxtFilename(input.txtName, input.reportDate),
		htmlFileName: input.htmlName,
	});
	// coverage only warns; collateral is escalation, not Settlement's.
	return r.checks.filter((c) => c.status === "fail" && c.id !== "collateral").map((c) => c.id);
}

// --- 1. Clean pairs -------------------------------------------------------
console.log(`Corpus: ${names.length} canonically named file(s) in ${dir}\n`);
console.log("1. Clean real files against a matching Frame report");
const usable = [];
const skipped = [];
for (const name of names) {
	const f = await load(name);
	// A Frame built from the file can't stand in for a real one when the file
	// is itself broken, unbalanced, repeats a bank or carries a legacy code
	// (Frame lists those separately; see legacyBankCodes.ts).
	const net = Math.round(f.txt.rows.reduce((s, r) => s + r.amount, 0) * 100);
	if (
		!f.txt.format.valid ||
		f.txt.rows.length === 0 ||
		net !== 0 ||
		f.txt.rows.some((r) => r.code in LEGACY_BANK_CODE_MERGES) ||
		new Set(f.txt.rows.map((r) => r.code)).size !== f.txt.rows.length
	) {
		skipped.push(name);
		continue;
	}
	usable.push(f);
	const ps = findAuditProblems(f.input);
	const checks = failingChecks(f.input);
	if (ps.length !== 0) fail(`${name}: ${ps.length} problem(s) on a matching pair: ${ps.map((p) => `${p.where} ${p.problem}`).join("; ")}`);
	if (checks.length !== 0) fail(`${name}: reconcile fails ${checks.join(", ")} on a matching pair`);
}
if (failures === 0) pass(`${usable.length} real file(s): zero problems and no failing checks`);
// Files with genuine defects (verified by hand in eval-weekend-merge.mjs) must still be explained.
for (const name of skipped) {
	const f = await load(name);
	const ps = findAuditProblems(f.input);
	const lineErrs = f.txt.format.issues.length;
	if (lineErrs > 0 && ps.filter((p) => p.kind === "format" || p.kind === "blank-line").length < lineErrs) {
		fail(`${name}: ${lineErrs} format issue(s) but only ${ps.length} problem(s)`);
	} else pass(`${name} (not a clean pair): ${ps.length} problem(s), e.g. ${ps[0] ? `${ps[0].where}: ${ps[0].problem}` : "none"}`);
}

// --- 2. Mutation fuzz -----------------------------------------------------
console.log(`\n2. Mutation fuzz: ${MUTATIONS} seeded single mutations`);
let seed = 0x5e771e;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (n) => Math.floor(rand() * n);
const bump = (s, i) => s.slice(0, i) + String((Number(s[i]) + 1 + pick(8)) % 10) + s.slice(i + 1);

const KINDS = ["amount", "space", "date", "code", "drop", "repeat", "name"];
const stats = Object.fromEntries(KINDS.map((k) => [k, { n: 0, ok: 0, first: null }]));
const consistency = { n: 0, ok: 0, first: null };

for (let m = 0; m < MUTATIONS; m++) {
	const f = usable[pick(usable.length)];
	const kind = KINDS[m % KINDS.length];
	const lines = f.text.split(/\r?\n/);
	if (lines[lines.length - 1] === "") lines.pop();
	const i = pick(lines.length);
	const [type, date, code, amount] = lines[i].split("\t");
	let txtName = f.name;
	let want; // [kind, line or null]
	if (kind === "amount") {
		lines[i] = [type, date, code, bump(amount, 1 + 7 + pick(10))].join("\t");
		want = [["amount"], i + 1];
	} else if (kind === "space") {
		const parts = lines[i].split("\t");
		const at = 1 + pick(3);
		lines[i] = parts.slice(0, at).join("\t") + " " + parts.slice(at).join("\t");
		want = [["format"], i + 1];
	} else if (kind === "date") {
		lines[i] = [type, bump(date, 9), code, amount].join("\t");
		want = [["date"], i + 1];
	} else if (kind === "code") {
		const c = bump(code, 4 + pick(6));
		if (f.txt.rows.some((r) => r.code === c)) continue;
		lines[i] = [type, date, c, amount].join("\t");
		// Matched to the right bank by amount, unless another bank has the same amount.
		want = [["wrong-code", "unknown-code", "extra-bank"], i + 1];
	} else if (kind === "drop") {
		if (Math.round(parseFloat(amount) * 100) === 0 || lines.length < 2) continue;
		lines.splice(i, 1);
		want = [["missing-bank"], null];
	} else if (kind === "repeat") {
		lines.push(lines[i]);
		want = [["duplicate-bank"], i + 1];
	} else {
		txtName = f.name.replace(/_(\d)\.txt$/, (_x, n) => `_${(Number(n) % 4) + 1}.txt`);
		want = [["file-name"], null];
	}
	const input = { ...f.input, txtText: lines.join("\r\n"), txtName };
	const ps = findAuditProblems(input);
	const s = stats[kind];
	s.n++;
	const good = ps.length === 1 && want[0].includes(ps[0].kind) && (want[1] === null || ps[0].lines.includes(want[1]));
	if (good) s.ok++;
	else s.first ??= `${f.name} ${kind} line ${i + 1}: got ${JSON.stringify(ps.map((p) => [p.kind, p.where]))}`;

	// One way only: the review is stricter than the audit (a bank missing from
	// the file only warns there), so it may list fixes for passing checks.
	const failing = failingChecks(input);
	if (failing.length > 0) {
		consistency.n++;
		if (ps.length > 0) consistency.ok++;
		else consistency.first ??= `${f.name} ${kind}: reconcile fails [${failing}], review lists nothing`;
	}
}
for (const k of KINDS) {
	const s = stats[k];
	const msg = `${k.padEnd(7)} ${s.ok}/${s.n} found as exactly one problem at the right line`;
	if (s.ok === s.n && s.n > 0) pass(msg);
	else fail(`${msg}${s.first ? ` (first miss: ${s.first})` : ""}`);
}

// --- 3. Consistency with the audit checks ----------------------------------
console.log("\n3. Every failing audit check is explained in the review");
if (consistency.ok === consistency.n && consistency.n > 0) pass(`${consistency.ok}/${consistency.n} mutations: reconcile fails a check and the review lists the fix`);
else fail(`${consistency.ok}/${consistency.n} (first: ${consistency.first})`);

// --- 4. The workbook --------------------------------------------------------
console.log("\n4. Workbook");
{
	const f = usable[0];
	const review = buildAuditReview(f.input, new Date());
	const banks = review.sheets[1].tables[0];
	const okName = review.fileName === f.name.replace(".txt", "_review.xlsx");
	const okRows = banks.rows.length === f.txt.rows.length && banks.rows.every((r) => r.cells[7].value === "OK" && r.cells[3].value === "");
	if (okName && okRows) pass(`${review.fileName}: ${banks.rows.length} banks side by side, all OK, gutter blank`);
	else fail(`workbook wrong: name ${review.fileName}, rows ${banks.rows.length}`);
}

console.log(failures === 0 ? "\nAll settlement-review invariants hold." : `\n${failures} invariant failure(s).`);
process.exit(failures === 0 ? 0 : 1);
