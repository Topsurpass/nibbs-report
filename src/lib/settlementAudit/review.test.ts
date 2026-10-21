import { test } from "node:test";
import assert from "node:assert/strict";
import type { FrameParseResult } from "../parseHtml.ts";
import type { MasterBank } from "../master.ts";
import { parseEtranzactTxt, validateTxtFilename } from "../parseTxt.ts";
import { reconcile } from "../reconcile.ts";
import { buildAuditReview, findAuditProblems, formatEtranzactAmount, reviewFileName, type AuditReviewInput } from "./review.ts";

const REPORT = new Date(2026, 6, 22); // Wed 22 Jul 2026
const NAME = "ETRANZACT_22072026_2.txt";
const HTML = "2026-07-22 B.html";

const MASTER: MasterBank[] = [
	{ code: "4000470158", name: "Access Bank plc", collateral: 1_000 },
	{ code: "4000460155", name: "ECOBANK", collateral: 1_000 },
	{ code: "4010160155", name: "Fidelity Bank", collateral: 1_000 },
	{ code: "4000070135", name: "FIRSTBANK", collateral: 1_000 },
];
const AMOUNTS: [string, number][] = [
	["4000470158", -1500.25],
	["4000460155", 700.25],
	["4010160155", 300],
	["4000070135", 500],
];

function frameOf(rows: [string, number][]): FrameParseResult {
	return {
		rows: rows.map(([code, netPosition]) => {
			const name = MASTER.find((m) => m.code === code)?.name ?? code;
			return { bankString: `${name} - ${code}`, name, code, outgoing: 0, incoming: netPosition, netPosition };
		}),
		netSum: rows.reduce((s, [, a]) => s + a, 0),
		droppedEmpty: 0,
		droppedPocketMoni: 0,
	};
}
const goodLines = () => AMOUNTS.map(([code, a]) => ["702", "2026/07/22", code, formatEtranzactAmount(a)].join("\t"));

function input(mutate: (l: string[]) => string[] = (l) => l, over: Partial<AuditReviewInput> = {}): AuditReviewInput {
	return {
		txtText: mutate(goodLines()).join("\r\n"),
		txtName: NAME,
		frame: frameOf(AMOUNTS),
		htmlName: HTML,
		master: MASTER,
		reportDate: REPORT,
		...over,
	};
}
const problems = (i: AuditReviewInput) => findAuditProblems(i);

/** reconcile's own verdict on the same files, for the consistency check. */
function failingChecks(i: AuditReviewInput) {
	const r = reconcile({
		frame: i.frame,
		txt: parseEtranzactTxt(i.txtText),
		master: i.master,
		reportDate: i.reportDate,
		filenameCheck: validateTxtFilename(i.txtName, i.reportDate),
		htmlFileName: i.htmlName,
	});
	return r.checks.filter((c) => c.status === "fail" && c.id !== "collateral").map((c) => c.id);
}

test("eTranzact amounts: sign, 17 zero-padded digits, 2 decimals", () => {
	assert.equal(formatEtranzactAmount(-63656071194.99), "-00000063656071194.99");
	assert.equal(formatEtranzactAmount(3756557371.44), "+00000003756557371.44");
	assert.equal(formatEtranzactAmount(0), "+00000000000000000.00");
	assert.equal(formatEtranzactAmount(-0.0000001), "+00000000000000000.00");
	assert.equal(formatEtranzactAmount(0.1 + 0.2), "+00000000000000000.30");
});

test("matching files: nothing to fix, and reconcile agrees", () => {
	const i = input();
	assert.deepEqual(problems(i), []);
	assert.deepEqual(failingChecks(i), []);
	const review = buildAuditReview(i, REPORT);
	assert.equal(review.sheets[0].preamble[1], "No problems found. Your file matches the Frame report.");
	assert.equal(review.fileName, "ETRANZACT_22072026_2_review.xlsx");
});

test("an amount that differs from the Frame report: line, bank, both amounts", () => {
	const i = input((l) => ((l[2] = l[2].replace("300.00", "301.00")), l));
	const ps = problems(i);
	assert.equal(ps.length, 1);
	assert.deepEqual([ps[0].kind, ps[0].where, ps[0].bank], ["amount", "Line 3", "Fidelity Bank (4010160155)"]);
	assert.equal(ps[0].yours, "+00000000000000301.00");
	assert.equal(ps[0].shouldBe, "+00000000000000300.00");
	assert.match(ps[0].problem, /off by 1\.00/);
	assert.ok(failingChecks(i).includes("jive"));
});

test("a space instead of a TAB is ONE spacing problem, not a missing bank too", () => {
	const i = input((l) => ((l[1] = l[1].replace("\t", " ")), l));
	const ps = problems(i);
	assert.equal(ps.length, 1);
	assert.equal(ps[0].kind, "format");
	assert.equal(ps[0].problem, "Space instead of TAB between 702 and the date");
	assert.match(ps[0].yours, /^702 \[SPACE\] 2026\/07\/22 \[TAB\] 4000460155/);
	assert.match(ps[0].shouldBe, /^702 \[TAB\] 2026\/07\/22 \[TAB\] 4000460155 \[TAB\] \+00000000000000700\.25$/);
	assert.ok(failingChecks(i).includes("txt-format"));
});

test("field format problems are named and the line is rebuilt", () => {
	const i = input((l) => ((l[0] = l[0].replace("4000470158", "###4000470158").replace("2026/07/22", "22/07/2026")), l));
	const [p] = problems(i);
	assert.equal(p.kind, "format");
	assert.match(p.problem, /Date must be YYYY\/MM\/DD, not "22\/07\/2026"/);
	assert.match(p.problem, /Bank code must be exactly 10 digits, not "###4000470158"/);
	assert.equal(p.shouldBe, "702 [TAB] 2026/07/22 [TAB] 4000470158 [TAB] -00000000000001500.25");
	assert.equal(problems(i).length, 1);
});

test("wrong date: per line, or one row when every line is wrong", () => {
	const one = problems(input((l) => ((l[3] = l[3].replace("2026/07/22", "2026/07/21")), l)));
	assert.deepEqual(one.map((p) => [p.kind, p.where, p.yours, p.shouldBe]), [["date", "Line 4", "2026/07/21", "2026/07/22"]]);
	const all = input((l) => l.map((x) => x.replace("2026/07/22", "2026/07/21")));
	const ps = problems(all);
	assert.deepEqual(ps.map((p) => [p.kind, p.problem, p.lines.length]), [["date", "Every line has the wrong date", 4]]);
	assert.ok(failingChecks(all).includes("dates"));
});

test("a mistyped bank code is matched to the missing Frame bank by amount", () => {
	const i = input((l) => ((l[3] = l[3].replace("4000070135", "4000070999")), l));
	const ps = problems(i);
	assert.equal(ps.length, 1);
	assert.deepEqual([ps[0].kind, ps[0].yours, ps[0].shouldBe, ps[0].bank], ["wrong-code", "4000070999", "4000070135", "FIRSTBANK (4000070135)"]);
	assert.ok(failingChecks(i).includes("code-match"));
});

test("an unknown code that matches nothing says to check it", () => {
	const i = input((l) => [...l, ["702", "2026/07/22", "4999999999", "+00000000000000000.00"].join("\t")]);
	const ps = problems(i);
	assert.deepEqual(ps.map((p) => [p.kind, p.where, p.shouldBe]), [["unknown-code", "Line 5", "Check the bank code"]]);
});

test("a Frame bank missing from the file: the exact line to add", () => {
	const i = input((l) => l.filter((_, k) => k !== 1));
	const ps = problems(i);
	assert.equal(ps.length, 1);
	assert.equal(ps[0].kind, "missing-bank");
	assert.equal(ps[0].shouldBe, "Add: 702 [TAB] 2026/07/22 [TAB] 4000460155 [TAB] +00000000000000700.25");
});

test("a master bank not in the Frame report is extra; a repeated bank is one problem", () => {
	const frame = frameOf(AMOUNTS.filter(([c]) => c !== "4000070135").map(([c, a]) => [c, c === "4010160155" ? a + 500 : a]));
	const extra = problems(input(undefined, { frame }));
	// FIRSTBANK's 500 moved to Fidelity in the Frame: Fidelity is off, FIRSTBANK is extra.
	assert.deepEqual(extra.map((p) => [p.kind, p.where]), [["amount", "Line 3"], ["extra-bank", "Line 4"]]);
	const dup = problems(input((l) => [...l, l[1]]));
	assert.deepEqual(dup.map((p) => [p.kind, p.where]), [["duplicate-bank", "Lines 2 and 5"]]);
});

test("file name: wrong date or a session that disagrees with the Frame letter", () => {
	const wrongSession = problems(input(undefined, { txtName: "ETRANZACT_22072026_3.txt" }));
	assert.deepEqual(wrongSession.map((p) => [p.problem, p.shouldBe]), [
		["Wrong session number in the file name (the Frame report 2026-07-22 B.html is _2)", NAME],
	]);
	const wrongDate = problems(input(undefined, { txtName: "ETRANZACT_21072026_2.txt" }));
	assert.equal(wrongDate[0].problem, "Wrong date in the file name");
	const copy = problems(input(undefined, { txtName: "ETRANZACT_22072026_2 (1).txt" }));
	assert.deepEqual([copy[0].problem, copy[0].shouldBe], ["File name is not ETRANZACT_<ddmmyyyy>_<n>.txt", NAME]);
	assert.equal(reviewFileName({ txtName: "ETRANZACT_22072026_2 (1).txt", htmlName: HTML, reportDate: REPORT }), "ETRANZACT_22072026_2_review.xlsx");
});

test("an unbalanced Frame report is listed first; collateral breaches never are", () => {
	const frame = frameOf([...AMOUNTS, ["4999999999", 10]]);
	const ps = problems(input((l) => [...l, ["702", "2026/07/22", "4999999999", "+00000000000000010.00"].join("\t")], { frame }));
	assert.deepEqual(ps.map((p) => p.kind), ["frame-balance"]);
	// Access is -1,500.25 against 1,000 collateral: a breach, but not Settlement's to fix.
	assert.ok(reconcile({
		frame: frameOf(AMOUNTS), txt: parseEtranzactTxt(input().txtText), master: MASTER, reportDate: REPORT,
		filenameCheck: validateTxtFilename(NAME, REPORT), htmlFileName: HTML,
	}).breaches.some((b) => b.kind === "collateral"));
	assert.deepEqual(problems(input()), []);
});

test("a legacy bank code in the Frame folds into its current bank", () => {
	const frame = frameOf([["4000470158", -1000.25], ["4000630109", -500], ...AMOUNTS.slice(1)]);
	assert.deepEqual(problems(input(undefined, { frame })), []);
});

test("an empty line in the middle is its own problem", () => {
	const ps = problems(input((l) => [l[0], "", ...l.slice(1)]));
	assert.deepEqual(ps.map((p) => [p.kind, p.where]), [["blank-line", "Line 2"]]);
});

test("the workbook: bands, a blank gutter, and every bank side by side", async () => {
	const i = input((l) => ((l[2] = l[2].replace("300.00", "301.00")), l));
	const review = buildAuditReview(i, REPORT);
	assert.deepEqual(review.sheets.map((s) => s.name), ["What to fix", "All banks"]);
	const banks = review.sheets[1].tables[0];
	assert.deepEqual(banks.rows.map((r) => r.cells[7].value), ["OK", "OK", "Fix", "OK"]);
	assert.equal(banks.rows[2].cells[6].value, "1.00");
	for (const s of review.sheets) for (const t of s.tables) for (const r of t.rows) assert.equal(r.cells.length, t.header.length);

	const ExcelJS = (await import("exceljs")).default;
	const { buildReviewXlsx } = await import("../reviewWorkbook/paint.ts");
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await buildReviewXlsx(review, ExcelJS, REPORT));
	const ws = wb.getWorksheet("What to fix")!;
	assert.equal(ws.getCell(2, 1).value, "1 problem found. Please fix it and send the file again.");
	assert.equal(ws.getCell(5, 4).value, "YOUR eTRANZACT FILE");
	assert.equal(ws.getCell(5, 6).value, "SHOULD BE (FRAME REPORT)");
	assert.equal(ws.getCell(7, 2).value, "Line 3");
	assert.equal(ws.getCell(7, 5).value, null);
	assert.equal(ws.getCell(7, 6).value, "+00000000000000300.00");
});
