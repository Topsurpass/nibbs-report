import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWithSettlement } from "./compare.ts";
import { buildDiscrepancyReport, findProblems, showSpacing, spacingProblem } from "./discrepancyReport.ts";
import { buildMerge } from "./merge.ts";
import { fullWeekend } from "./testFixtures.ts";

const GENERATED = new Date(2026, 5, 8, 9, 30);
const merge = buildMerge(fullWeekend(), new Date(2026, 5, 8), 1);
const lines = merge.text.split("\r\n");
const banks: Record<string, string> = { "4000470158": "Access Bank", "4000460155": "Ecobank" };
const bankName = (code: string) => banks[code];

function run(mutate: (l: string[]) => string[], name = merge.fileName) {
	const comparison = compareWithSettlement(
		{ name: merge.fileName, text: merge.text },
		{ name, text: mutate([...lines]).join("\r\n") },
	);
	const input = { merge, comparison, settlementName: name, generatedAt: GENERATED, bankName };
	return { comparison, problems: findProblems(input), model: buildDiscrepancyReport(input) };
}
const fixTable = (m: ReturnType<typeof run>["model"]) => m.sheets[0].tables[0];

test("two plain sheets, named as a review for the Settlement team", () => {
	const { model } = run((l) => l);
	assert.equal(model.fileName, "ETRANZACT_08062026_1_review.xlsx");
	assert.deepEqual(model.sheets.map((s) => s.name), ["What to fix", "All lines"]);
	assert.deepEqual(fixTable(model).header, ["#", "Line", "Problem", "In your file", "", "Should be", "Bank", "Session"]);
});

test("a blank gutter column and labelled bands separate ours from Settlement's", () => {
	const { model } = run((l) => l);
	const fix = fixTable(model);
	const all = model.sheets[1].tables[0];
	assert.deepEqual(fix.gaps, [4]);
	assert.deepEqual(all.gaps, [4]);
	assert.deepEqual(all.header, ["Line", "Bank", "Our date", "Our amount", "", "Your date", "Your amount", "Status"]);
	assert.deepEqual(all.bands?.map((b) => [b.label, b.from, b.to, b.side]), [
		["OUR COMPILATION", 2, 3, "ours"],
		["SETTLEMENT'S FILE", 5, 6, "theirs"],
	]);
	for (const t of [fix, all]) for (const r of t.rows) if (r.style !== "group") assert.equal(r.cells[4].value, "");
});

test("a matching file says so and lists nothing to fix", () => {
	const { model, problems } = run((l) => l);
	assert.equal(problems.length, 0);
	assert.equal(model.sheets[0].preamble[1], "No problems found. Your file matches ours.");
	assert.equal(model.sheets[0].verdictTone, "good");
});

test("a wrong amount is one plain row: what you have, what it should be", () => {
	const { problems, model } = run((l) => ((l[0] = l[0].replace(/\d\.(\d\d)$/, (_m, d) => `9.${d}`)), l));
	assert.equal(problems.length, 1);
	const p = problems[0];
	assert.equal(p.lines, "1");
	assert.equal(p.problem, "Wrong amount");
	assert.equal(p.shouldBe, lines[0].split("\t")[3]);
	assert.notEqual(p.yours, p.shouldBe);
	assert.equal(p.session, "Sat 06 Jun · 8am");
	assert.equal(p.bank, "Access Bank (4000470158)");
	assert.equal(model.sheets[0].preamble[1], "1 problem found in your file. Please fix it and send it again.");
});

test("a space instead of a tab is shown with readable [TAB]/[SPACE] markers", () => {
	const { problems } = run((l) => ((l[1] = l[1].replace("\t", " ")), l));
	assert.equal(problems.length, 1);
	assert.equal(problems[0].problem, "Space instead of TAB between 702 and the date");
	assert.match(problems[0].yours, /^702 \[SPACE\] 2026\/06\/08 \[TAB\] /);
	assert.match(problems[0].shouldBe, /^702 \[TAB\] 2026\/06\/08 \[TAB\] /);
	assert.equal(showSpacing("a\tb c"), "a [TAB] b [SPACE] c");
	assert.equal(showSpacing("a\t\tb"), "a [TAB] [TAB] b");
	assert.equal(spacingProblem("702\t2026/06/08\t4000470158  +1.00"), "Space instead of TAB between the bank code and the amount");
	assert.equal(spacingProblem("702\t\t2026/06/08\t4000470158\t+1.00"), "Extra TAB between 702 and the date");
	assert.equal(spacingProblem("702\t2026/06/08\t4000470158\t+1.00 "), "Space or TAB after the amount at the end");
});

test("wrong date and wrong bank code are separate, plainly named problems", () => {
	const { problems } = run((l) => ((l[2] = l[2].replace("2026/06/08", "2026/06/07").replace(/\t\d{10}\t/, "\t4999999999\t")), l));
	assert.deepEqual(problems.map((p) => [p.lines, p.problem, p.yours]), [
		["3", "Wrong date", "2026/06/07"],
		["3", "Wrong bank code", "4999999999"],
	]);
});

test("two swapped lines are ONE problem: swap them", () => {
	const { problems } = run((l) => (([l[3], l[9]] = [l[9], l[3]]), l));
	assert.equal(problems.length, 1);
	assert.equal(problems[0].problem, "Lines in the wrong order");
	assert.equal(problems[0].lines, "4 and 10");
	assert.equal(problems[0].shouldBe, "Swap lines 4 and 10");
});

test("a line left out is ONE problem, not every shifted line after it", () => {
	const { comparison, problems } = run((l) => (l.splice(5, 1), l));
	assert.ok(comparison.mismatched > 20);
	assert.equal(problems.length, 1);
	assert.equal(problems[0].problem, "A line is missing");
	assert.equal(problems[0].lines, "6 onwards");
	assert.equal(problems[0].shouldBe, `Insert at line 6: ${showSpacing(lines[5])}`);
});

test("an extra line added mid-file is ONE problem: delete it", () => {
	const extra = "702\t2026/06/08\t4000470158\t+00000000000000001.00";
	const { problems } = run((l) => (l.splice(5, 0, extra), l));
	assert.equal(problems.length, 1);
	assert.equal(problems[0].problem, "An extra line");
	assert.equal(problems[0].lines, "6");
	assert.equal(problems[0].yours, showSpacing(extra));
	assert.match(problems[0].shouldBe, /^Delete line 6/);
});

test("missing or extra line at the very end", () => {
	assert.deepEqual(run((l) => l.slice(0, -1)).problems.map((p) => [p.lines, p.problem]), [["32", "Line missing"]]);
	const extra = run((l) => [...l, l[0]]).problems;
	assert.deepEqual(extra.map((p) => [p.lines, p.problem, p.shouldBe]), [["33", "Extra line", "Delete this line"]]);
});

test("a wrong file name and an empty last line are listed too", () => {
	const { problems } = run((l) => [...l, ""], "ETRANZACT_09062026_2.txt");
	assert.deepEqual(problems.map((p) => [p.lines, p.problem, p.yours, p.shouldBe]), [
		["File name", "Wrong file name", "ETRANZACT_09062026_2.txt", "ETRANZACT_08062026_1.txt"],
		["End of file", "Empty line at the end", "The file ends with an empty line", "Remove the empty last line"],
	]);
});

test("session order list and the All lines sheet", () => {
	const { model } = run((l) => ((l[0] = l[0].replace("2026/06/08", "2026/06/06")), l));
	const order = model.sheets[0].tables[1];
	assert.equal(order.rows.length, 8);
	assert.deepEqual(order.rows[0].cells.slice(0, 4).map((c) => c.value), [1, "1 to 4", "Sat 06 Jun · 8am", "ETRANZACT_06062026_1.txt"]);
	const all = model.sheets[1].tables[0].rows;
	assert.equal(all.filter((r) => r.style === "group").length, 8);
	const line1 = all[1];
	assert.equal(line1.cells[0].value, 1);
	assert.equal(line1.cells[5].value, "2026/06/06");
	assert.equal(line1.cells[5].tone, "bad");
	assert.equal(line1.cells[7].value, "Fix");
	assert.equal(all[2].cells[7].value, "OK");
	for (const s of model.sheets) for (const t of s.tables) for (const r of t.rows) assert.equal(r.cells.length, t.header.length);
});

test("the painted workbook: verdict, red 'In your file', green 'Should be'", async () => {
	const ExcelJS = (await import("exceljs")).default;
	const { buildDiscrepancyXlsx } = await import("./discrepancyExcel.ts");
	const { model } = run((l) => ((l[0] = l[0].replace(/\d\.(\d\d)$/, (_m, d) => `9.${d}`)), l));
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await buildDiscrepancyXlsx(model, ExcelJS, GENERATED));
	const ws = wb.getWorksheet("What to fix")!;
	assert.equal(ws.getCell(2, 1).value, "1 problem found in your file. Please fix it and send it again.");
	// Preamble (3) + blank → band row 5, header row 6, first problem row 7.
	assert.equal(ws.getCell(5, 4).value, "SETTLEMENT'S FILE");
	assert.equal(ws.getCell(5, 6).value, "OUR COMPILATION");
	assert.equal(ws.getCell(6, 3).value, "Problem");
	assert.equal(ws.getCell(7, 3).value, "Wrong amount");
	const fill = (r: number, c: number) => (ws.getCell(r, c).fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
	assert.equal(fill(7, 4), "FFFECACA");
	assert.equal(fill(7, 6), "FFDCFCE7");
	// Column 5 is the gutter: nothing in it, no fill, no border, on every row.
	for (const r of [5, 6, 7]) {
		assert.equal(ws.getCell(r, 5).value, null);
		assert.equal(fill(r, 5), undefined);
		assert.equal(ws.getCell(r, 5).border?.top, undefined);
	}
	assert.equal(ws.getColumn(5).width, 3);
	assert.equal(ws.views[0].state, "frozen");
	const lines = wb.getWorksheet("All lines")!;
	// Preamble (2) + blank → band row 4: ours over C:D, Settlement's over F:G.
	assert.equal(lines.getCell(4, 3).value, "OUR COMPILATION");
	assert.equal(lines.getCell(4, 6).value, "SETTLEMENT'S FILE");
	assert.equal(lines.getCell(4, 4).isMerged, true);
	assert.equal(lines.getCell(5, 5).value, null);
});
