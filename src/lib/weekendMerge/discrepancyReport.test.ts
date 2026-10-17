import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWithSettlement } from "./compare.ts";
import { badFields, buildDiscrepancyReport, fixHint } from "./discrepancyReport.ts";
import { buildMerge } from "./merge.ts";
import { fullWeekend } from "./testFixtures.ts";

const GENERATED = new Date(2026, 5, 8, 9, 30);
const merge = buildMerge(fullWeekend(), new Date(2026, 5, 8), 1);
const lines = merge.text.split("\r\n");

function report(mutate: (l: string[]) => string[]) {
	const theirs = mutate([...lines]).join("\r\n");
	const comparison = compareWithSettlement({ name: merge.fileName, text: merge.text }, { name: merge.fileName, text: theirs });
	return {
		comparison,
		model: buildDiscrepancyReport({ merge, comparison, settlementName: "settlement.txt", generatedAt: GENERATED }),
	};
}
const sheet = (m: ReturnType<typeof report>["model"], name: string) => m.sheets.find((s) => s.name === name)!;
const dataRows = (m: ReturnType<typeof report>["model"], name: string) => sheet(m, name).rows.filter((r) => r.style !== "group");

test("file name and sheets", () => {
	const { model } = report((l) => l);
	assert.equal(model.fileName, "ETRANZACT_08062026_1_discrepancies.xlsx");
	assert.deepEqual(model.sheets.map((s) => s.name), ["Summary", "Differences", "Side by side", "Merge order"]);
});

test("a clean match: every row Match, no differences, MATCH verdict", () => {
	const { model } = report((l) => l);
	assert.equal(dataRows(model, "Differences").length, 0);
	assert.ok(dataRows(model, "Side by side").every((r) => r.style === "match"));
	assert.match(String(sheet(model, "Summary").preamble[1]), /^MATCH/);
});

test("side by side keeps merge order with a block per session file", () => {
	const { model } = report((l) => l);
	const rows = sheet(model, "Side by side").rows;
	const groups = rows.filter((r) => r.style === "group").map((r) => String(r.cells[0].value));
	assert.equal(groups.length, 8);
	assert.match(groups[0], /^Saturday 2026\/06\/06 · 8am \(_1\) · ETRANZACT_06062026_1\.txt · our lines 1–4$/);
	assert.match(groups[7], /^Sunday 2026\/06\/07 · 5pm \(_4\) · ETRANZACT_07062026_4\.txt · our lines 29–32$/);
	const firstData = rows[1];
	assert.equal(firstData.cells[0].value, 1);
	assert.equal(firstData.cells[3].value, "ETRANZACT_06062026_1.txt line 1");
});

test("a wrong amount marks only Settlement's amount cell and says how to fix it", () => {
	const { model } = report((l) => ((l[5] = l[5].replace(/\d\.(\d\d)$/, (_m, d) => `9.${d}`)), l));
	const diffs = dataRows(model, "Differences");
	assert.equal(diffs.length, 1);
	const row = diffs[0];
	assert.equal(row.cells[0].value, 6);
	assert.equal(row.cells[1].value, "Amount");
	// Columns 8-11 are Settlement's type/date/code/amount.
	assert.deepEqual(row.cells.slice(8, 12).map((c) => c.tone ?? null), [null, null, null, "bad"]);
	assert.match(String(row.cells[14].value), /^Correct line 6: Amount: expected/);
	assert.equal(row.cells[3].value, "ETRANZACT_06062026_2.txt line 2");
});

test("spacing errors flag the raw line, shown with visible tabs and spaces", () => {
	const { model } = report((l) => ((l[0] = l[0].replace("\t", " ")), l));
	const row = dataRows(model, "Differences")[0];
	assert.equal(row.cells[1].value, "Spacing");
	assert.equal(row.cells[12].tone, "bad");
	assert.match(String(row.cells[12].value), /^702·2026\/06\/08⇥/);
});

test("rows in the wrong place point at where they belong", () => {
	const { comparison } = report((l) => (([l[3], l[9]] = [l[9], l[3]]), l));
	const diff = comparison.rows[3];
	assert.deepEqual(badFields(diff), [true, true, true, true]);
	assert.equal(fixHint(diff), "Line 4 is in the wrong place; it belongs at line 10. Check the session order.");
});

test("missing and extra lines are reported with clear fixes", () => {
	const missing = report((l) => l.slice(0, -1));
	const last = dataRows(missing.model, "Differences").at(-1)!;
	assert.equal(last.cells[14].value, "Add this row as line 32 of your file.");

	const extra = report((l) => [...l, l[0]]);
	const side = sheet(extra.model, "Side by side").rows;
	assert.ok(side.some((r) => r.style === "group" && /Lines only in Settlement/.test(String(r.cells[0].value))));
	const extraRow = dataRows(extra.model, "Differences").at(-1)!;
	assert.equal(extraRow.cells[3].value, "Not in our compilation");
	assert.equal(extraRow.cells[14].value, "Remove line 33 from your file; we have no such row.");
});

test("merge order sheet counts differing lines per session file", () => {
	const { model } = report((l) => ((l[5] = l[5].replace("2026/06/08", "2026/06/06")), l));
	const order = sheet(model, "Merge order").rows;
	assert.equal(order.length, 8);
	assert.deepEqual(order[1].cells.map((c) => c.value), [2, "ETRANZACT_06062026_2.txt", "Saturday 2026/06/06", "11am (_2)", 4, "5–8", 1]);
	assert.equal(order[1].style, "mismatch");
	assert.equal(order[0].cells[6].value, 0);
});

test("every sheet row has exactly one cell per column", () => {
	const { model } = report((l) => ((l[2] = l[2].replace("\t", "  ")), [...l, l[1]]));
	for (const s of model.sheets) for (const r of s.rows) assert.equal(r.cells.length, s.header.length, `${s.name}`);
});

test("the painted workbook highlights the wrong cell and freezes the header", async () => {
	const ExcelJS = (await import("exceljs")).default;
	const { buildDiscrepancyXlsx } = await import("./discrepancyExcel.ts");
	const { model } = report((l) => ((l[5] = l[5].replace(/\d\.(\d\d)$/, (_m, d) => `9.${d}`)), l));
	const bytes = await buildDiscrepancyXlsx(model, ExcelJS, GENERATED);
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(bytes);
	assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary", "Differences", "Side by side", "Merge order"]);

	const diff = wb.getWorksheet("Differences")!;
	// Preamble (2) + blank + group banner + header => header on row 5, first difference on row 6.
	assert.equal(diff.getCell(5, 1).value, "Line");
	assert.equal(diff.getCell(6, 1).value, 6);
	const amount = diff.getCell(6, 12); // Settlement's amount
	assert.equal((amount.fill as { fgColor?: { argb?: string } }).fgColor?.argb, "FFFECACA");
	assert.equal(amount.font?.bold, true);
	// Our amount sits beside theirs, unhighlighted, and the two differ.
	assert.equal(diff.getCell(6, 8).value, lines[5].split("\t")[3]);
	assert.notEqual(diff.getCell(6, 8).value, amount.value);
	assert.equal(diff.getCell(6, 8).fill?.type === "pattern" && (diff.getCell(6, 8).fill as { fgColor?: { argb?: string } }).fgColor?.argb, "FFFEF2F2");
	assert.equal(diff.views[0].state, "frozen");

	const side = wb.getWorksheet("Side by side")!;
	assert.match(String(side.getCell(6, 1).value), /^Saturday 2026\/06\/06 · 8am/);
});
