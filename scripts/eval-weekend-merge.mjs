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
//      date, code, amount, row swap, dropped row, filename) are each caught
//      by compareWithSettlement with the right mismatch kind at the right row,
//      and an LF swapped in for a CRLF is NOT flagged (they are equivalent).
//   4. Settlement-style join: real session bodies joined with a bare LF (how
//      Settlement's tool builds its file) compare as a full match.
//   5. Weekend + other days: real bodies re-dated to Sat/Sun (4 sessions each)
//      plus a 2-session Monday merge with no warning, default to Monday (or
//      Tuesday when Monday is a holiday), and put Monday's rows last. Only an
//      incomplete Saturday/Sunday blocks. No real weekday file is warned.
//   Every mutation's "What to fix" list must be one plain problem covering
//   every flagged line (none for an LF/CRLF swap).
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

const {
	inspectSourceFile,
	buildMerge,
	mergeChecks,
	compareWithSettlement,
	sortSources,
	assessCollection,
	canMerge,
	defaultMergeDate,
	buildSessionBoard,
	isWeekend,
} = await import("../src/lib/weekendMerge/index.ts");
const { buildDiscrepancyReport } = await import("../src/lib/weekendMerge/discrepancyReport.ts");
const { validateTxtFormat } = await import("../src/lib/parseTxt.ts");
const { findProblems } = await import("../src/lib/weekendMerge/discrepancyReport.ts");

const dir = process.argv[2] ?? join(homedir(), "Downloads", "Nibbs Portal");
const MUTATIONS = Number(process.env.EVAL_MUTATIONS ?? 600);

let failures = 0;
const fail = (message) => {
	failures++;
	console.error(`  ✗ ${message}`);
};
const pass = (message) => console.log(`  ✓ ${message}`);
const check = (ok, good, bad) => {
	if (ok) pass(good);
	else fail(bad);
};

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
		check(!f.valid && expected.test(failText(f)) && f.issues.filter((i) => i.severity === "fail").length === 1, `${f.name} rejected for the right reason: ${failText(f)}`, `${f.name} should be rejected only for ${expected}, got: ${failText(f) || "accepted"}`);
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
check(orderOk, `${merged.sources.length} files merged in strict date → session order`, "merge order is wrong");

const expectedLines = sortSources(valid).flatMap((f) => f.records.map((r) => `702\t2026/06/08\t${r.code}\t${r.amountStr}`));
const lines = merged.text.split("\r\n");
if (lines.length === expectedLines.length && lines.every((l, i) => l === expectedLines[i])) {
	pass(`${lines.length} rows: every source row once, only the date column rewritten`);
} else fail(`row content mismatch (${lines.length} merged vs ${expectedLines.length} expected)`);

check(
	!/[^\r]\n/.test(merged.text) && !merged.text.endsWith("\n"),
	"CRLF line endings, no trailing newline",
	"output is not CRLF without trailing newline",
);
check(validateTxtFormat(merged.text).valid, "merged file passes the record template", "merged file breaks the template");
const outChecks = mergeChecks(merged, mergeDate).filter((c) => c.status === "fail");
check(outChecks.length === 0, "output checks: rows carried, net = 0, template", `output checks failed: ${outChecks.map((c) => c.id).join(", ")}`);
const self = compareWithSettlement({ name: merged.fileName, text: merged.text }, { name: merged.fileName, text: merged.text });
check(self.pass && self.mismatched === 0, "identical Settlement file compares clean", "identical file did not compare clean");

// Complete real days (all 4 sessions) must pass the collection gate.
const byDay = new Map();
for (const f of valid) byDay.set(f.dateSegment, [...(byDay.get(f.dateSegment) ?? []), f]);
const completeDays = [...byDay.values()].filter((fs) => new Set(fs.map((f) => f.session)).size === 4);
if (completeDays.length > 0) {
	const set = completeDays.flat();
	check(canMerge(assessCollection(set)), `collection gate accepts ${completeDays.length} complete real day(s)`, "collection gate rejected complete days");
}
const partialWeekend = [...byDay.values()].find((fs) => fs.length < 4 && isWeekend(fs[0].date));
if (partialWeekend) {
	check(!canMerge(assessCollection(partialWeekend)), `collection gate blocks an incomplete weekend day (${partialWeekend[0].dateSegment})`, "collection gate accepted an incomplete weekend day");
}
const partialWeekdays = [...byDay.values()].filter((fs) => fs.length < 4 && !isWeekend(fs[0].date)).flat();
if (partialWeekdays.length > 0) {
	const c = assessCollection(partialWeekdays).find((x) => x.id === "sessions-complete");
	check(c?.status === "pass", `${partialWeekdays.length} real weekday file(s) on incomplete days are accepted`, `incomplete weekdays flagged: ${c?.detail}`);
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
	// Not an error: LF and CRLF are equivalent, so this must still match.
	"lf-equivalent": (ls, i) => ({ lines: ls, row: i + 1, kind: "lf-equivalent", lfAfter: i }),
	missing: (ls, i) => (ls.splice(i, 1), { lines: ls, row: ls.length + 1, kind: "missing" }),
	filename: (ls) => ({ lines: ls, kind: "filename" }),
};
const kinds = Object.keys(MUTATORS);
const stats = Object.fromEntries(kinds.map((k) => [k, { n: 0, caught: 0 }]));
const reportStats = { n: 0, ok: 0 };

for (let m = 0; m < MUTATIONS; m++) {
	const kind = kinds[m % kinds.length];
	const base = merged.text.split("\r\n");
	const i = kind === "lf-equivalent" ? pick(base.length - 1) : pick(base.length);
	const mut = MUTATORS[kind](base, i);
	if (mut.lines.join("\r\n") === merged.text && kind !== "filename" && kind !== "lf-equivalent") {
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
		kind === "lf-equivalent"
			? r.pass && r.mismatched === 0
			: !r.pass &&
				(kind === "filename"
					? r.checks.find((c) => c.id === "cmp-filename").status === "fail"
					: r.rows[mut.row - 1]?.kinds.includes(kind));
	if (caught) s.caught++;
	else if (s.n - s.caught <= 3) fail(`${kind} at row ${mut.row ?? "-"} not handled correctly`);

	// The "What to fix" list must turn ONE planted error into ONE plain problem
	// that covers every line the comparison flagged (a missing line must not
	// become dozens of "out of order" rows), and list nothing for LF/CRLF.
	const problems = findProblems({ merge: merged, comparison: r });
	const flagged = r.rows.filter((x) => !x.ok).map((x) => x.row);
	const covered = new Set(problems.flatMap((p) => p.rows));
	const reportOk =
		kind === "lf-equivalent"
			? problems.length === 0
			: problems.length >= 1 &&
				problems.length <= (kind === "date" || kind === "code" || kind === "amount" ? 1 : 2) &&
				flagged.every((row) => covered.has(row)) &&
				problems.every((p) => p.problem && p.shouldBe);
	reportStats.n++;
	if (reportStats.n && reportOk) reportStats.ok++;
	else if (reportStats.n - reportStats.ok <= 3)
		fail(`What-to-fix wrong for ${kind}: ${problems.length} problem(s) ${JSON.stringify(problems.map((p) => [p.lines, p.problem]))}, flagged ${flagged.slice(0, 6)}`);
}
for (const k of kinds) {
	const { n, caught } = stats[k];
	if (k === "lf-equivalent") {
		check(caught === n, `${k.padEnd(13)} ${caught}/${n} matched as equivalent`, `${k.padEnd(13)} ${caught}/${n} matched as equivalent`);
		continue;
	}
	const pct = ((caught / n) * 100).toFixed(1);
	check(caught === n, `${k.padEnd(12)} ${caught}/${n} caught (${pct}%)`, `${k.padEnd(12)} ${caught}/${n} caught (${pct}%)`);
}

check(
	reportStats.ok === reportStats.n,
	`"What to fix": one plain problem per planted error, covering every flagged line: ${reportStats.ok}/${reportStats.n}`,
	`"What to fix" correct on ${reportStats.ok}/${reportStats.n}`,
);

console.log("\n4. Settlement-style join (session files glued with a bare LF)");
{
	const slash = "2026/06/08";
	const bodies = sortSources(valid).map((f) => f.records.map((r) => `702\t${slash}\t${r.code}\t${r.amountStr}`).join("\r\n"));
	const settlementStyle = bodies.join("\n");
	const r = compareWithSettlement(ours, { name: merged.fileName, text: settlementStyle });
	const lfJoins = bodies.length - 1;
	check(
		r.pass && r.mismatched === 0 && r.matched === merged.rows.length,
		`${lfJoins} LF joins across ${bodies.length} real files: all ${r.matched} rows match`,
		`LF-joined file did not match: ${r.mismatched} mismatches, failing ${r.checks.filter((c) => c.status === "fail").map((c) => c.id).join(",")}`,
	);
}

console.log("\n5. Weekend plus other days");
{
	const weekdayWarned = valid.filter((f) => !isWeekend(f.date) && f.issues.some((i) => /holiday|weekday/i.test(i.message)));
	check(weekdayWarned.length === 0, `${valid.filter((f) => !isWeekend(f.date)).length} real weekday file(s): none warned as "weekday"`, `weekday warnings on ${weekdayWarned.map((f) => f.name).join(", ")}`);

	// Re-date real bodies: Sat 17 Oct 2026 ×4, Sun 18 Oct ×4, Mon 19 Oct ×2.
	const bodies = sortSources(valid).filter((f) => f.records.length > 0).slice(0, 10);
	const plan = [
		...[1, 2, 3, 4].map((s) => ["17102026", s]),
		...[1, 2, 3, 4].map((s) => ["18102026", s]),
		["19102026", 1],
		["19102026", 2],
	];
	const redated = plan.map(([ddmmyyyy, s], i) => {
		const slash = `${ddmmyyyy.slice(4)}/${ddmmyyyy.slice(2, 4)}/${ddmmyyyy.slice(0, 2)}`;
		const text = bodies[i % bodies.length].records.map((r) => `702\t${slash}\t${r.code}\t${r.amountStr}`).join("\r\n");
		return inspectSourceFile(`ETRANZACT_${ddmmyyyy}_${s}.txt`, text);
	});
	const checks = assessCollection([...redated].reverse());
	const notPass = checks.filter((c) => c.status !== "pass");
	check(redated.every((f) => f.valid && f.issues.length === 0), "10 re-dated real files accepted with no issues", `re-dated files: ${redated.map((f) => f.issues.map((i) => i.message).join("; ")).join(" | ")}`);
	check(notPass.length === 0 && canMerge(checks), "Sat ×4 + Sun ×4 + Mon ×2: every collection check passes", `not passing: ${notPass.map((c) => `${c.id}=${c.status} (${c.detail})`).join("; ")}`);

	const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const plain = defaultMergeDate(redated);
	check(iso(plain) === "2026-10-19", "default merge date is Monday 19 Oct (day after Sunday)", `default merge date ${iso(plain)}`);
	const monHoliday = (key) => (key === "2026-10-19" ? { date: key, name: "Test Holiday", tentative: false } : undefined);
	const skip = defaultMergeDate(redated, monHoliday);
	check(iso(skip) === "2026-10-20", "Monday a public holiday → merge date Tuesday 20 Oct", `holiday merge date ${iso(skip)}`);

	const m = buildMerge(redated, plain, 1);
	const out = mergeChecks(m, plain).filter((c) => c.status !== "pass");
	check(out.length === 0, "merged into Monday: every output check passes (incl. merge date)", `output not passing: ${out.map((c) => `${c.id} (${c.detail})`).join("; ")}`);
	const mondayFirst = m.rows.findIndex((r) => r.sourceName.startsWith("ETRANZACT_19102026"));
	check(
		mondayFirst > 0 && m.rows.slice(mondayFirst).every((r) => r.sourceName.startsWith("ETRANZACT_19102026")),
		`Monday's rows come last (from row ${mondayFirst + 1} of ${m.rows.length})`,
		"Monday rows are not last",
	);
	const board = buildSessionBoard(redated);
	const mon = board.days.find((d) => !d.weekend);
	check(
		mon && !mon.required && mon.slots.filter((x) => x.state === "optional").length === 2 && board.days.filter((d) => d.weekend).every((d) => d.required),
		"board: Monday's empty slots are optional, weekend days required",
		"board slot states wrong",
	);
	const incomplete = redated.filter((f) => f.name !== "ETRANZACT_17102026_3.txt");
	check(!canMerge(assessCollection(incomplete)), "a Saturday missing a session still blocks", "an incomplete Saturday was accepted");

	const self = compareWithSettlement({ name: m.fileName, text: m.text }, { name: m.fileName, text: m.text });
	const report = buildDiscrepancyReport({ merge: m, comparison: self, settlementName: m.fileName, generatedAt: new Date(2026, 9, 19) });
	check(report.fileName === "ETRANZACT_19102026_1_review.xlsx", `workbook named ${report.fileName}`, `workbook named ${report.fileName}`);
	const all = report.sheets[1].tables[0];
	check(
		all.gaps?.[0] === 4 && all.rows.every((r) => r.cells.length === all.header.length && (r.style === "group" || r.cells[4].value === "")),
		"All lines sheet: blank gutter column between ours and Settlement's on every row",
		"gutter column missing or filled",
	);
}

console.log(failures === 0 ? "\nAll weekend-merge invariants hold." : `\n${failures} invariant failure(s).`);
process.exit(failures === 0 ? 0 : 1);
