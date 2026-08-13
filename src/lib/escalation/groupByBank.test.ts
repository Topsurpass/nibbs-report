import { test } from "node:test";
import assert from "node:assert/strict";
import { detectColumns } from "./detectColumns.ts";
import { groupByBank, unmappedCodes, verifyRowAccounting } from "./groupByBank.ts";
import { mergeDirectory } from "./nipDirectory.ts";
import type { Row } from "./types.ts";

const DIR = mergeDirectory();

const HEADERS = ["beneficiary_issuer_code", "amount", "receiver_response_code", "beneficiary_name"];

/** Two banks, one unmapped code (C62 / NOMBA FS), one failed transfer. */
function spool(): Row[] {
	return [
		{ beneficiary_issuer_code: "C39", amount: "1,000,000.00", receiver_response_code: "00", beneficiary_name: "A" },
		{ beneficiary_issuer_code: "C39", amount: "4,990,000.00", receiver_response_code: "00", beneficiary_name: "A" },
		{ beneficiary_issuer_code: "044", amount: "300,000.00", receiver_response_code: "00", beneficiary_name: "B" },
		{ beneficiary_issuer_code: "044", amount: "500,000.00", receiver_response_code: "97", beneficiary_name: "B" },
		{ beneficiary_issuer_code: "C62", amount: "4,990,000.00", receiver_response_code: "97", beneficiary_name: "C" },
	];
}

function group(rows: Row[], successfulOnly = false) {
	const columns = detectColumns(rows, HEADERS, DIR);
	return groupByBank({ rows, columns, directory: DIR, successfulOnly });
}

test("routes rows to their beneficiary bank with counts and totals", () => {
	const result = group(spool());
	assert.equal(result.groups.length, 3);

	const c39 = result.groups.find((g) => g.code === "C39");
	assert.ok(c39);
	assert.equal(c39.name, "ROLEZ MICROFINANCE BANK");
	assert.equal(c39.unmapped, false);
	assert.equal(c39.rows.length, 2);
	assert.equal(c39.total, 5990000);

	const access = result.groups.find((g) => g.code === "044");
	assert.ok(access);
	assert.equal(access.name, "Access Bank plc");
	assert.equal(access.rows.length, 2);
	assert.equal(access.total, 800000);
});

test("groups are ordered by exposure, unmapped last", () => {
	const result = group(spool());
	assert.deepEqual(
		result.groups.map((g) => g.code),
		["C39", "C62", "044"].sort((a, b) => {
			const t: Record<string, number> = { C39: 5990000, "044": 800000, C62: -1 };
			return t[b] - t[a];
		}),
	);
	// Concretely: biggest mapped bank first, unmapped bucket last.
	assert.equal(result.groups[0].code, "C39");
	assert.equal(result.groups.at(-1)?.code, "C62");
	assert.equal(result.groups.at(-1)?.unmapped, true);
});

test("an unknown code becomes its own unmapped bucket, never dropped", () => {
	const result = group(spool());
	const unmapped = unmappedCodes(result);
	assert.equal(unmapped.length, 1);
	assert.equal(unmapped[0].code, "C62");
	assert.equal(unmapped[0].name, "");
	assert.equal(unmapped[0].rows.length, 1);
	assert.equal(unmapped[0].total, 4990000);
});

test("saving the override moves the bucket into a named bank", () => {
	const rows = spool();
	const directory = mergeDirectory([{ code: "C62", name: "NOMBA FS" }]);
	const columns = detectColumns(rows, HEADERS, directory);
	const result = groupByBank({ rows, columns, directory });

	assert.equal(unmappedCodes(result).length, 0);
	const nomba = result.groups.find((g) => g.code === "C62");
	assert.ok(nomba);
	assert.equal(nomba.name, "NOMBA FS");
	assert.equal(nomba.unmapped, false);
});

test("row accounting: nothing is lost", () => {
	const result = group(spool());
	assert.ok(verifyRowAccounting(result));
	assert.equal(result.inputRows, 5);
	const grouped = result.groups.reduce((n, g) => n + g.rows.length, 0);
	assert.equal(grouped, 5);
	assert.equal(result.noCode.length, 0);
	assert.equal(result.filteredOut, 0);
});

test("grand total equals the sum of the per-bank totals", () => {
	const result = group(spool());
	assert.equal(result.grandTotal, 5990000 + 800000 + 4990000);
	assert.equal(
		result.grandTotal,
		result.groups.reduce((n, g) => n + g.total, 0),
	);
});

test("successfulOnly drops failures and still balances the accounting", () => {
	const result = group(spool(), true);
	assert.equal(result.filteredOut, 2); // the two 97s
	assert.ok(verifyRowAccounting(result));

	const access = result.groups.find((g) => g.code === "044");
	assert.equal(access?.rows.length, 1);
	assert.equal(access?.total, 300000);
	// The unmapped C62 row was a failure, so its bucket disappears entirely.
	assert.equal(result.groups.some((g) => g.code === "C62"), false);
});

test("rows with a blank or malformed code go to noCode, not into a bank", () => {
	const good = (code: string): Row => ({
		beneficiary_issuer_code: code,
		amount: "100.00",
		receiver_response_code: "00",
		beneficiary_name: "X",
	});
	const rows: Row[] = [
		...Array.from({ length: 10 }, () => good("C39")),
		{ ...good(""), beneficiary_name: "D" },
		{ ...good("ZZZZZ"), beneficiary_name: "E" }, // 5 chars: not code-shaped
	];
	const result = group(rows);
	assert.equal(result.noCode.length, 2);
	assert.ok(verifyRowAccounting(result));
	// "ZZZZZ" is malformed, so it is not routed anywhere as a bank.
	assert.ok(!result.groups.some((g) => g.code === "ZZZZZ"));
	assert.equal(result.groups.length, 1);
	assert.equal(result.groups[0].rows.length, 10);
});

test("a column of well-shaped codes is detected even when half are unknown", () => {
	// This is the C62 / NOMBA FS case. The column is unmistakably the code
	// column; the directory is just out of date. Detection must not give up and
	// dump every row into noCode — those rows belong in nameable UNMAPPED buckets.
	const rows: Row[] = [
		{ beneficiary_issuer_code: "C39", amount: "100", receiver_response_code: "00", beneficiary_name: "A" },
		{ beneficiary_issuer_code: "ZZZ", amount: "200", receiver_response_code: "00", beneficiary_name: "B" },
	];
	const columns = detectColumns(rows, HEADERS, DIR);
	assert.equal(columns.code?.column, "beneficiary_issuer_code");
	assert.equal(columns.code?.matchRate, 0.5);

	const result = groupByBank({ rows, columns, directory: DIR });
	assert.equal(result.groups.length, 2);
	assert.equal(result.groups.find((g) => g.code === "ZZZ")?.unmapped, true);
	assert.equal(result.noCode.length, 0);
	assert.ok(verifyRowAccounting(result));
});

test("a code-shaped column that names no bank is rejected", () => {
	// `currency` is always "NGN": perfectly 3-char, resolves to nothing.
	const headers = ["currency", "amount"];
	const rows: Row[] = Array.from({ length: 10 }, () => ({ currency: "NGN", amount: "100" }));
	const result = detectColumns(rows, headers, DIR);
	assert.equal(result.code, null);
	assert.ok(!result.candidates.some((c) => c.column === "currency"));
});

test("an explicit codeColumn override beats detection", () => {
	const headers = ["beneficiary_issuer_code", "initiator_issuer_code", "amount"];
	const rows: Row[] = [
		{ beneficiary_issuer_code: "C39", initiator_issuer_code: "050", amount: "100" },
		{ beneficiary_issuer_code: "044", initiator_issuer_code: "050", amount: "200" },
	];
	const columns = detectColumns(rows, headers, DIR);
	assert.equal(columns.code?.column, "beneficiary_issuer_code");

	const forced = groupByBank({
		rows,
		columns,
		directory: DIR,
		codeColumn: "initiator_issuer_code",
		codeMode: "direct",
	});
	assert.equal(forced.groups.length, 1);
	assert.equal(forced.groups[0].code, "050");
});

test("prefixed spool groups by the first 3 chars of the 13-char value", () => {
	const headers = ["reciever", "destination", "format(a.amount,2)", "respCode"];
	const rows: Row[] = [
		{ reciever: "0113064018987", destination: "3064018987", "format(a.amount,2)": "50,000.00", respCode: "0" },
		{ reciever: "C038105655588", destination: "8105655588", "format(a.amount,2)": "2,000.00", respCode: "0" },
		{ reciever: "0112012894017", destination: "2012894017", "format(a.amount,2)": "250,000.00", respCode: "0" },
	];
	const columns = detectColumns(rows, headers, DIR);
	assert.equal(columns.code?.column, "reciever");
	const result = groupByBank({ rows, columns, directory: DIR });

	assert.equal(result.groups.length, 2);
	const firstBank = result.groups.find((g) => g.code === "011");
	assert.equal(firstBank?.name, "FIRSTBANK");
	assert.equal(firstBank?.rows.length, 2);
	assert.equal(firstBank?.total, 300000);
	assert.ok(verifyRowAccounting(result));
});

test("no code column at all: every row lands in noCode", () => {
	const rows: Row[] = [{ narration: "Agency fee" }, { narration: "Rent" }];
	const columns = detectColumns(rows, ["narration"], DIR);
	const result = groupByBank({ rows, columns, directory: DIR });
	assert.equal(result.groups.length, 0);
	assert.equal(result.noCode.length, 2);
	assert.ok(verifyRowAccounting(result));
});

test("an empty spool produces an empty, balanced result", () => {
	const columns = detectColumns([], HEADERS, DIR);
	const result = groupByBank({ rows: [], columns, directory: DIR });
	assert.deepEqual(result.groups, []);
	assert.equal(result.grandTotal, 0);
	assert.ok(verifyRowAccounting(result));
});
