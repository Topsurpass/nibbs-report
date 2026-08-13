import { test } from "node:test";
import assert from "node:assert/strict";
import { NIP_BANK_CODES, NIP_BANK_CODE_COUNT } from "./nipBankCodes.ts";
import { isCodeShaped, lookupBank, mergeDirectory, normalizeCode } from "./nipDirectory.ts";

test("bundled directory: every code is 3 alphanumeric chars", () => {
	const codes = Object.keys(NIP_BANK_CODES);
	assert.equal(codes.length, NIP_BANK_CODE_COUNT);
	assert.equal(codes.length, 250);
	for (const code of codes) {
		assert.ok(isCodeShaped(code), `"${code}" is not a 3-char alphanumeric code`);
		assert.equal(code, code.toUpperCase(), `"${code}" is not upper-cased`);
		assert.ok(NIP_BANK_CODES[code].length > 0, `${code} has an empty name`);
	}
});

test("bundled directory carries the codes seen in the real spools", () => {
	assert.equal(NIP_BANK_CODES["C39"], "ROLEZ MICROFINANCE BANK");
	assert.equal(NIP_BANK_CODES["C03"], "Paycom (Opay)");
	assert.equal(NIP_BANK_CODES["B99"], "Palmpay");
	assert.equal(NIP_BANK_CODES["011"], "FIRSTBANK");
	assert.equal(NIP_BANK_CODES["044"], "Access Bank plc");
	assert.equal(NIP_BANK_CODES["058"], "Guaranty Trust Bank PLC");
});

test("no bundled code begins with 00 (the single-zero padding assumption)", () => {
	// detectColumns restores exactly one leading zero. That is only safe while
	// no institution code needs two.
	for (const code of Object.keys(NIP_BANK_CODES)) {
		assert.ok(!code.startsWith("00"), `${code} would need two leading zeros restored`);
	}
});

test("normalizeCode trims and upper-cases", () => {
	assert.equal(normalizeCode(" c39 "), "C39");
	assert.equal(normalizeCode("b99"), "B99");
	assert.equal(normalizeCode(null), "");
	assert.equal(normalizeCode(undefined), "");
});

test("isCodeShaped accepts 3 alphanumerics only", () => {
	assert.ok(isCodeShaped("011"));
	assert.ok(isCodeShaped("C39"));
	assert.ok(!isCodeShaped("11"));
	assert.ok(!isCodeShaped("0110"));
	assert.ok(!isCodeShaped("C-9"));
	assert.ok(!isCodeShaped(""));
});

test("C62 is unmapped by default and mapped once an override is saved", () => {
	const plain = mergeDirectory();
	assert.equal(lookupBank(plain, "C62"), "");

	const withOverride = mergeDirectory([{ code: "C62", name: "NOMBA FS" }]);
	assert.equal(lookupBank(withOverride, "C62"), "NOMBA FS");
	assert.equal(lookupBank(withOverride, "c62"), "NOMBA FS", "lookup is case-insensitive");
	// The bundled entries survive the merge.
	assert.equal(lookupBank(withOverride, "C39"), "ROLEZ MICROFINANCE BANK");
});

test("overrides win over the bundled snapshot", () => {
	const merged = mergeDirectory([{ code: "035", name: "Wema Bank Plc" }]);
	assert.equal(merged["035"], "Wema Bank Plc");
});

test("malformed overrides are ignored rather than corrupting the directory", () => {
	const merged = mergeDirectory([
		{ code: "TOOLONG", name: "Nope" },
		{ code: "C62", name: "   " },
		{ code: "", name: "Nameless" },
	]);
	assert.equal(merged["TOOLONG"], undefined);
	assert.equal(merged["C62"], undefined);
	assert.equal(Object.keys(merged).length, NIP_BANK_CODE_COUNT);
});

test("mergeDirectory does not mutate the frozen bundled map", () => {
	mergeDirectory([{ code: "C62", name: "NOMBA FS" }]);
	assert.equal(NIP_BANK_CODES["C62"], undefined);
});
