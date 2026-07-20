import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBanks, parseMasterFromRows } from "./importBanks.ts";

test("parses a basic 'Name - code' | collateral sheet", () => {
	const { banks, errors } = parseMasterFromRows([
		["Bank", "Collateral"], // header — skipped
		["Access Bank plc - 4000470158", 11950000000],
		["ECOBANK - 4000460155", "1,000,000,000"],
	]);
	assert.deepEqual(errors, []);
	assert.deepEqual(banks, [
		{ name: "Access Bank plc", code: "4000470158", collateral: 11950000000 },
		{ name: "ECOBANK", code: "4000460155", collateral: 1000000000 },
	]);
});

test("keeps bank names that themselves contain ' - '", () => {
	const { banks } = parseMasterFromRows([
		["First - City - Bank - 4010100137", 1220000000],
	]);
	assert.equal(banks.length, 1);
	assert.equal(banks[0].name, "First - City - Bank");
	assert.equal(banks[0].code, "4010100137");
});

test("strips a ₦ symbol and commas from collateral", () => {
	const { banks } = parseMasterFromRows([["WEMA - 4000020120", "₦25,000,000"]]);
	assert.equal(banks[0].collateral, 25000000);
});

test("rejects a code that is not 10 digits", () => {
	const { banks, errors } = parseMasterFromRows([
		["Access - 40004", 100],
		["GTB - 40005601850", 200], // 11 digits
	]);
	assert.equal(banks.length, 0);
	assert.equal(errors.length, 2);
	assert.match(errors[0], /not 10 digits/);
});

test("flags non-numeric collateral", () => {
	const { banks, errors } = parseMasterFromRows([["Zenith - 4000540179", "n/a"]]);
	assert.equal(banks.length, 0);
	assert.match(errors[0], /not a number/);
});

test("flags negative collateral", () => {
	const { banks, errors } = parseMasterFromRows([["Zenith - 4000540179", -5]]);
	assert.equal(banks.length, 0);
	assert.match(errors[0], /negative/);
});

test("notes a duplicate code but keeps the last value", () => {
	const { banks, errors } = parseMasterFromRows([
		["Access - 4000470158", 100],
		["Access again - 4000470158", 200],
	]);
	assert.equal(banks.length, 2);
	assert.match(errors[0], /duplicate/);
});

test("mergeBanks upserts by code and appends new codes", () => {
	const existing = [
		{ code: "4000470158", name: "Access", collateral: 1 },
		{ code: "4000460155", name: "Ecobank", collateral: 2 },
	];
	const imported = [
		{ code: "4000470158", name: "Access Bank plc", collateral: 999 }, // update
		{ code: "9999999999", name: "New Bank", collateral: 5 }, // append
	];
	const merged = mergeBanks(existing, imported);
	assert.equal(merged.length, 3);
	assert.deepEqual(merged[0], { code: "4000470158", name: "Access Bank plc", collateral: 999 });
	assert.equal(merged[1].name, "Ecobank"); // untouched
	assert.equal(merged[2].code, "9999999999");
});
