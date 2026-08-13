import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSheetGrid, buildSummaryGrid, describeGroup, resolveHeaders } from "./projectColumns.ts";
import { BANK_NAME_COLUMN, type BankGroup } from "./types.ts";

const HEADERS = ["id", "amount", "beneficiary_name", "beneficiary_issuer_code", "mac", "card_num"];

const group = (over: Partial<BankGroup> = {}): BankGroup => ({
	code: "C39",
	name: "ROLEZ MICROFINANCE BANK",
	unmapped: false,
	rows: [
		{ id: "377381368", amount: "1,000,000.00", beneficiary_name: "KIRA A", beneficiary_issuer_code: "C39", mac: "", card_num: "" },
		{ id: "377381443", amount: "4,990,000.00", beneficiary_name: "KIRA A", beneficiary_issuer_code: "C39", mac: "", card_num: "" },
	],
	total: 5990000,
	...over,
});

test("no selection keeps every column, bank name first", () => {
	const headers = resolveHeaders(HEADERS, { columns: [], includeBankName: true });
	assert.deepEqual(headers, [BANK_NAME_COLUMN, ...HEADERS]);
});

test("a selection keeps the file's original column order, not the pick order", () => {
	const headers = resolveHeaders(HEADERS, {
		columns: ["card_num", "id", "amount"], // deliberately out of order
		includeBankName: false,
	});
	assert.deepEqual(headers, ["id", "amount", "card_num"]);
});

test("unchecking columns removes them from the output", () => {
	const headers = resolveHeaders(HEADERS, {
		columns: ["id", "amount", "beneficiary_name", "beneficiary_issuer_code"],
		includeBankName: true,
	});
	assert.deepEqual(headers, [
		BANK_NAME_COLUMN,
		"id",
		"amount",
		"beneficiary_name",
		"beneficiary_issuer_code",
	]);
	assert.ok(!headers.includes("mac"));
	assert.ok(!headers.includes("card_num"));
});

test("includeBankName off drops the synthetic column", () => {
	const headers = resolveHeaders(HEADERS, { columns: ["id"], includeBankName: false });
	assert.deepEqual(headers, ["id"]);
});

test("a selection naming an absent column is ignored", () => {
	const headers = resolveHeaders(HEADERS, {
		columns: ["id", "not_in_this_file"],
		includeBankName: false,
	});
	assert.deepEqual(headers, ["id"]);
});

test("grid: bank name is filled on every row, amounts become numbers", () => {
	const grid = buildSheetGrid(group(), HEADERS, { columns: [], includeBankName: true }, "amount");
	assert.equal(grid.header[0], BANK_NAME_COLUMN);
	assert.equal(grid.rows.length, 2);
	assert.equal(grid.rows[0][0], "ROLEZ MICROFINANCE BANK");
	assert.equal(grid.rows[1][0], "ROLEZ MICROFINANCE BANK");
	// "1,000,000.00" is written as a real number so the bank can sum it.
	assert.equal(grid.rows[0][2], 1000000);
	assert.equal(grid.rows[1][2], 4990000);
	// Everything else passes through verbatim.
	assert.equal(grid.rows[0][1], "377381368");
	assert.equal(grid.rows[0][3], "KIRA A");
});

test("grid: totals row sums only the amount column", () => {
	const grid = buildSheetGrid(group(), HEADERS, { columns: [], includeBankName: true }, "amount");
	assert.ok(grid.totals);
	assert.equal(grid.amountIndex, grid.header.indexOf("amount") + 1);
	assert.equal(grid.totals[grid.amountIndex - 1], 5990000);
	assert.equal(grid.totals[0], "TOTAL (2)");
	// No other cell carries a value.
	grid.totals.forEach((cell, i) => {
		if (i === 0 || i === grid.amountIndex - 1) return;
		assert.equal(cell, "", `column ${grid.header[i]} should be blank in the totals row`);
	});
});

test("grid: totals row matches the group total exactly", () => {
	const g = group({ total: 5990000 });
	const grid = buildSheetGrid(g, HEADERS, { columns: [], includeBankName: true }, "amount");
	assert.equal(grid.totals?.[grid.amountIndex - 1], g.total);
});

test("grid: no amount column means no totals row", () => {
	const grid = buildSheetGrid(group(), HEADERS, { columns: ["id"], includeBankName: false }, null);
	assert.equal(grid.totals, null);
	assert.equal(grid.amountIndex, 0);
});

test("grid: dropping the amount column also drops the totals row", () => {
	// The amount column is not in the selection, so there is nothing to total.
	const grid = buildSheetGrid(
		group(),
		HEADERS,
		{ columns: ["id", "beneficiary_name"], includeBankName: true },
		"amount",
	);
	assert.ok(!grid.header.includes("amount"));
	assert.equal(grid.amountIndex, 0);
	assert.equal(grid.totals, null);
});

test("grid: unmapped groups are labelled as buckets", () => {
	const grid = buildSheetGrid(
		group({ code: "C62", name: "", unmapped: true }),
		HEADERS,
		{ columns: [], includeBankName: true },
		"amount",
	);
	assert.equal(grid.rows[0][0], "UNMAPPED-C62");
});

test("summary grid lists each bank and totals the lot", () => {
	const groups = [
		group(),
		group({ code: "044", name: "Access Bank plc", total: 800000, rows: [group().rows[0]] }),
	];
	const grid = buildSummaryGrid(groups);
	assert.deepEqual(grid.header, ["Beneficiary Bank", "Code", "Transactions", "Total Amount"]);
	assert.deepEqual(grid.rows[0], ["ROLEZ MICROFINANCE BANK", "C39", 2, 5990000]);
	assert.deepEqual(grid.rows[1], ["Access Bank plc", "044", 1, 800000]);
	assert.deepEqual(grid.totals, ["TOTAL (2 banks)", "", 3, 6790000]);
});

test("describeGroup pluralises and formats", () => {
	assert.equal(describeGroup(group()), "2 transactions · 5,990,000.00");
	assert.equal(
		describeGroup(group({ rows: [group().rows[0]], total: 1000000 })),
		"1 transaction · 1,000,000.00",
	);
});
