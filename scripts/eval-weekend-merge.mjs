// Corpus check for the Weekend Settlement merge.
//
// The gate tests in src/lib/weekendMerge/*.test.ts run on synthetic files. This
// harness runs the same modules over the real ETRANZACT_*.txt files on this
// machine (gitignored, never committed) and asserts:
//   1. Upload checks: every canonically named real file is accepted; every
//      copy-suffixed name ("... (1).txt") is rejected.
//   2. Round trip: merging real files in a scrambled upload order yields date/
//      session order, every source row exactly once with only the date column
//      changed, CRLF with no trailing newline, the record template, net = 0.
//   3. Mutation fuzz: single seeded mutations of the merged file (tab→space,
//      date, code, amount, row swap, LF, dropped row, filename) are each caught
//      by compareWithSettlement with the right mismatch kind at the right row.
//
//   npm run eval:weekend-merge                 # ~/Downloads/Nibbs Portal
//   npm run eval:weekend-merge -- path/to/dir  # another folder of .txt files
//   EVAL_MUTATIONS=2000 npm run eval:weekend-merge
//
// Exits non-zero if any invariant fails. Pass threshold: 100% (deterministic).

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const { inspectSourceFile, buildMerge, mergeChecks, compareWithSettlement, sortSources, assessCollection, canMerge } =
	await import("../src/lib/weekendMerge/index.ts");
const { validateTxtFormat } = await import("../src/lib/parseTxt.ts");

const dir = process.argv[2] ?? join(homedir(), "Downloads", "Nibbs Portal");
const MUTATIONS = Number(process.env.EVAL_MUTATIONS ?? 600);

let failures = 0;
const fail = (message) => {
	failures++;
	console.error(`  ✗ ${message}`);
};
const pass = (message) => console.log(`  ✓ ${message}`);

if (!existsSync(dir)) {
	console.error(`No corpus at ${dir}. Pass a folder of ETRANZACT_*.txt files.`);
	process.exit(1);
}
const names = readdirSync(dir).filter((n) => /^ETRANZACT_.*\.txt$/i.test(n)).sort();
if (names.length === 0) {
	console.error(`No ETRANZACT_*.txt files in ${dir}.`);
	process.exit(1);
}
const files = await Promise.all(names.map(async (n) => inspectSourceFile(n, await readFile(join(dir, n), "utf8"))));
console.log(`Corpus: ${files.length} file(s) in ${dir}\n`);

// --- 1. Upload checks ---------------------------------------------------------
console.log("1. Upload checks on real files");
const canonical = files.filter((f) => /^ETRANZACT_\d{8}_[1-4]\.txt$/.test(f.name));
const copies = files.filter((f) => !/^ETRANZACT_\d{8}_[1-4]\.txt$/.test(f.name));
// Real files with genuine defects, verified by hand on 2026-10-16. Each must be
// rejected for exactly this reason; every other canonical file must be accepted.
const KNOWN_BAD = {
	"ETRANZACT_19052026_1.txt": /Rows sum to -1,000\.00/, // 22 rows net to -1,000.00
	"ETRANZACT_20022026_4.txt": /date must be YYYY\/MM\/DD \(got "2\/20\/2026"\)/, // line 13
	"ETRANZACT_22102024_1.txt": /account must be exactly 10 digits \(got "###4000015030"/, // line 8
};
const failText = (f) => f.issues.filter((i) => i.severity === "fail").map((i) => i.message).join("; ");
let accepted = 0;
for (const f of canonical) {
	const expected = KNOWN_BAD[f.name];
	if (expected) {
		!f.valid && expected.test(failText(f)) && f.issues.filter((i) => i.severity === "fail").length === 1
			? pass(`${f.name} rejected for the right reason: ${failText(f)}`)
			: fail(`${f.name} should be rejected only for ${expected}, got: ${failText(f) || "accepted"}`);
	} else if (f.valid) accepted++;
	else fail(`${f.name} rejected: ${failText(f)}`);
}
pass(`${accepted} other canonically named file(s) accepted`);
const acceptedCopies = copies.filter((f) => f.valid);
if (acceptedCopies.length === 0) pass(`${copies.length} non-canonical name(s) all rejected`);
for (const f of acceptedCopies) fail(`${f.name} should be rejected by the filename check`);

// --- 2. Round trip --------------------------------------------------------------
console.log("\n2. Merge round trip on real files");
const valid = canonical.filter((f) => f.valid);
// Scramble upload order deterministically: reverse, then interleave.
const rev = [...valid].reverse();
const scrambled = [...rev.filter((_, i) => i % 2 === 0), ...rev.filter((_, i) => i % 2 === 1)];
const mergeDate = new Date(2026, 5, 8);
const merged = buildMerge(scrambled, mergeDate, 1);
const expectedOrder = sortSources(valid).map((f) => f.name);

const orderOk =
	merged.sources.every((s, i) => s.name === expectedOrder[i]) &&
	merged.sources.every((s, i, a) => i === 0 || a[i - 1].date.getTime() * 10 + a[i - 1].session < s.date.getTime() * 10 + s.session);
orderOk ? pass(`${merged.sources.length} files merged in strict date → session order`) : fail("merge order is wrong");

const expectedLines = sortSources(valid).flatMap((f) => f.records.map((r) => `702\t2026/06/08\t${r.code}\t${r.amountStr}`));
const lines = merged.text.split("\r\n");
if (lines.length === expectedLines.length && lines.every((l, i) => l === expectedLines[i])) {
	pass(`${lines.length} rows: every source row once, only the date column rewritten`);
} else fail(`row content mismatch (${lines.length} merged vs ${expectedLines.length} expected)`);

/[^\r]\n/.test(merged.text) || merged.text.endsWith("\n") ? fail("output is not CRLF without trailing newline") : pass("CRLF line endings, no trailing newline");
validateTxtFormat(merged.text).valid ? pass("merged file passes the record template") : fail("merged file breaks the template");
const outChecks = mergeChecks(merged, mergeDate).filter((c) => c.status === "fail");
outChecks.length === 0 ? pass("output checks: rows carried, net = 0, template") : fail(`output checks failed: ${outChecks.map((c) => c.id).join(", ")}`);
const self = compareWithSettlement({ name: merged.fileName, text: merged.text }, { name: merged.fileName, text: merged.text });
self.pass && self.mismatched === 0 ? pass("identical Settlement file compares clean") : fail("identical file did not compare clean");

// Complete real days (all 4 sessions) must pass the collection gate.
const byDay = new Map();
for (const f of valid) byDay.set(f.dateSegment, [...(byDay.get(f.dateSegment) ?? []), f]);
const completeDays = [...byDay.values()].filter((fs) => new Set(fs.map((f) => f.session)).size === 4);
if (completeDays.length > 0) {
	const set = completeDays.flat();
	canMerge(assessCollection(set))
		? pass(`collection gate accepts ${completeDays.length} complete real day(s)`)
		: fail("collection gate rejected complete days");
}
const partial = [...byDay.values()].find((fs) => fs.length < 4);
if (partial) {
	!canMerge(assessCollection(partial))
		? pass(`collection gate blocks an incomplete day (${partial[0].dateSegment})`)
		: fail("collection gate accepted an incomplete day");
}

// --- 3. Mutation fuzz ---------------------------------------------------------
console.log(`\n3. Mutation fuzz: ${MUTATIONS} seeded single mutations`);
let seed = 0x5eed;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (n) => Math.floor(rand() * n);
const bumpDigit = (s, from, to) => {
	const i = from + pick(to - from);
	if (!/\d/.test(s[i])) return s;
	return s.slice(0, i) + String((Number(s[i]) + 1 + pick(8)) % 10) + s.slice(i + 1);
};
const ours = { name: merged.fileName, text: merged.text };

const MUTATORS = {
	whitespace: (ls, i) => {
		const tabs = [...ls[i].matchAll(/\t/g)].map((m) => m.index);
		const at = tabs[pick(tabs.length)];
		ls[i] = ls[i].slice(0, at) + " ".repeat(1 + pick(3)) + ls[i].slice(at + 1);
		return { lines: ls, row: i + 1, kind: "whitespace" };
	},
	date: (ls, i) => ((ls[i] = ls[i].replace("2026/06/08", `2026/06/0${pick(7) + 1}`)), { lines: ls, row: i + 1, kind: "date" }),
	code: (ls, i) => {
		const [t, d, c, a] = ls[i].split("\t");
		ls[i] = [t, d, bumpDigit(c, 0, 10), a].join("\t");
		return { lines: ls, row: i + 1, kind: "code" };
	},
	amount: (ls, i) => {
		const [t, d, c, a] = ls[i].split("\t");
		ls[i] = [t, d, c, bumpDigit(a, 1, a.length)].join("\t");
		return { lines: ls, row: i + 1, kind: "amount" };
	},
	order: (ls, i) => {
		let j = pick(ls.length);
		while (ls[j] === ls[i]) j = (j + 1) % ls.length;
		[ls[i], ls[j]] = [ls[j], ls[i]];
		return { lines: ls, row: i + 1, kind: "order" };
	},
	"line-ending": (ls, i) => ({ lines: ls, row: i + 1, kind: "line-ending", lfAfter: i }),
	missing: (ls, i) => (ls.splice(i, 1), { lines: ls, row: ls.length + 1, kind: "missing" }),
	filename: (ls) => ({ lines: ls, kind: "filename" }),
};
const kinds = Object.keys(MUTATORS);
const stats = Object.fromEntries(kinds.map((k) => [k, { n: 0, caught: 0 }]));

for (let m = 0; m < MUTATIONS; m++) {
	const kind = kinds[m % kinds.length];
	const base = merged.text.split("\r\n");
	const i = kind === "line-ending" ? pick(base.length - 1) : pick(base.length);
	const mut = MUTATORS[kind](base, i);
	if (mut.lines.join("\r\n") === merged.text && kind !== "filename" && kind !== "line-ending") {
		m--; // no-op mutation (e.g. bumped digit landed on the same value); redraw
		continue;
	}
	let text = mut.lines.join("\r\n");
	if (mut.lfAfter !== undefined) {
		text = mut.lines.slice(0, mut.lfAfter + 1).join("\r\n") + "\n" + mut.lines.slice(mut.lfAfter + 1).join("\r\n");
	}
	const name = kind === "filename" ? merged.fileName.replace("_1.txt", `_${2 + pick(3)}.txt`) : merged.fileName;
	const r = compareWithSettlement(ours, { name, text });
	const s = stats[kind];
	s.n++;
	const caught =
		!r.pass &&
		(kind === "filename"
			? r.checks.find((c) => c.id === "cmp-filename").status === "fail"
			: r.rows[mut.row - 1]?.kinds.includes(kind));
	if (caught) s.caught++;
	else if (s.n - s.caught <= 3) fail(`${kind} at row ${mut.row ?? "-"} not caught as ${kind}`);
}
for (const k of kinds) {
	const { n, caught } = stats[k];
	const pct = ((caught / n) * 100).toFixed(1);
	caught === n ? pass(`${k.padEnd(12)} ${caught}/${n} caught (${pct}%)`) : fail(`${k.padEnd(12)} ${caught}/${n} caught (${pct}%)`);
}

console.log(failures === 0 ? "\nAll weekend-merge invariants hold." : `\n${failures} invariant failure(s).`);
process.exit(failures === 0 ? 0 : 1);
