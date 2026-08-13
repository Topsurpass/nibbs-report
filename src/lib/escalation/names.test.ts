import { test } from "node:test";
import assert from "node:assert/strict";
import {
	groupFileStem,
	groupLabel,
	groupSheetName,
	safeFileName,
	safeSheetName,
	todayStamp,
} from "./names.ts";
import type { BankGroup } from "./types.ts";

const bank = (over: Partial<BankGroup> = {}): BankGroup => ({
	code: "C39",
	name: "ROLEZ MICROFINANCE BANK",
	unmapped: false,
	rows: [],
	total: 0,
	...over,
});

test("sheet names are capped at Excel's 31-character limit", () => {
	const taken = new Set<string>();
	// 33 chars in the real directory.
	const long = safeSheetName("Lagos Building Investment Company", taken);
	assert.equal(long.length, 31);
	assert.equal(long, "Lagos Building Investment Compa");
});

test("sheet names strip the characters Excel rejects", () => {
	const taken = new Set<string>();
	assert.equal(safeSheetName("A/B:C*D?E[F]G\\H", taken), "A-B-C-D-E-F-G-H");
});

test("truncated sheet names that collide are de-duplicated, not overwritten", () => {
	const taken = new Set<string>();
	const a = safeSheetName("Lagos Building Investment Company Ltd", taken);
	const b = safeSheetName("Lagos Building Investment Company Plc", taken);
	const c = safeSheetName("Lagos Building Investment Company Inc", taken);
	assert.notEqual(a, b);
	assert.notEqual(b, c);
	assert.notEqual(a, c);
	for (const name of [a, b, c]) assert.ok(name.length <= 31, `${name} is too long`);
	// The suffix is carved out of the 31-char budget, not appended past it.
	assert.equal(b, "Lagos Building Investment C (2)");
	assert.equal(c, "Lagos Building Investment C (3)");
});

test("sheet-name de-duplication is case-insensitive", () => {
	const taken = new Set<string>();
	assert.equal(safeSheetName("Wema", taken), "Wema");
	assert.notEqual(safeSheetName("WEMA", taken), "WEMA");
});

test("an empty bank name still yields a usable sheet name", () => {
	const taken = new Set<string>();
	assert.equal(safeSheetName("   ", taken), "Sheet");
});

test("file names drop path separators and other illegal characters", () => {
	const taken = new Set<string>();
	assert.equal(safeFileName("Paycom (Opay)", taken), "Paycom_(Opay)");
	assert.equal(safeFileName("A/B\\C:D*E?F", taken), "A-B-C-D-E-F");
	// No trailing dots — Windows rejects them.
	assert.equal(safeFileName("Bank Ltd.", taken), "Bank_Ltd");
	// Control characters are stripped, not passed into the archive.
	assert.equal(safeFileName("Bank\u0000Ltd", taken), "Bank-Ltd");
});

test("file names cannot escape the archive with traversal", () => {
	const name = safeFileName("../../etc/passwd", new Set());
	assert.ok(!name.includes("/"), name);
	assert.ok(!name.includes("\\"), name);
	assert.ok(!name.startsWith("."), name);
	assert.equal(name, "-..-etc-passwd");

	// A Windows-style absolute path is equally defanged.
	const win = safeFileName("C:\\Windows\\System32", new Set());
	assert.ok(!win.includes("\\"), win);
	assert.equal(win, "C--Windows-System32");
});

test("file names are de-duplicated too", () => {
	const taken = new Set<string>();
	assert.equal(safeFileName("WEMA", taken), "WEMA");
	assert.equal(safeFileName("WEMA", taken), "WEMA (2)");
});

test("groupLabel names mapped banks and buckets unmapped codes", () => {
	assert.equal(groupLabel(bank()), "ROLEZ MICROFINANCE BANK");
	assert.equal(groupLabel(bank({ code: "C62", name: "", unmapped: true })), "UNMAPPED-C62");
});

test("groupSheetName always keeps the bank code, trimming the name instead", () => {
	const taken = new Set<string>();
	// Naive truncation of "United Bank for Africa Plc (033)" clips the closing
	// bracket; a longer name would lose the code entirely.
	const uba = groupSheetName(
		bank({ code: "033", name: "United Bank for Africa Plc" }),
		taken,
	);
	assert.ok(uba.length <= 31, uba);
	assert.ok(uba.endsWith("(033)"), uba);
	assert.equal(uba, "United Bank for Africa Plc (033)".slice(0, 25).trimEnd() + " (033)");

	const long = groupSheetName(
		bank({ code: "C25", name: "Lagos Building Investment Company" }),
		taken,
	);
	assert.ok(long.length <= 31, long);
	assert.ok(long.endsWith("(C25)"), long);
});

test("groupSheetName strips characters Excel rejects and de-duplicates", () => {
	const taken = new Set<string>();
	const a = groupSheetName(bank({ code: "A01", name: "Bank/With:Illegal*Chars" }), taken);
	assert.ok(!/[[\]:*?/\\]/.test(a), a);

	// Same name, same code twice would collide.
	const b = groupSheetName(bank({ code: "A01", name: "Bank/With:Illegal*Chars" }), taken);
	assert.notEqual(a, b);
	assert.ok(b.length <= 31, b);
});

test("groupSheetName labels unmapped groups as buckets", () => {
	const name = groupSheetName(bank({ code: "C62", name: "", unmapped: true }), new Set());
	assert.equal(name, "UNMAPPED-C62 (C62)");
});

test("groupFileStem carries the code so a bank can be identified at a glance", () => {
	assert.equal(groupFileStem(bank()), "ROLEZ MICROFINANCE BANK (C39)");
	assert.equal(groupFileStem(bank({ code: "C62", name: "", unmapped: true })), "UNMAPPED-C62 (C62)");
});

test("todayStamp is a zero-padded local YYYY-MM-DD", () => {
	assert.equal(todayStamp(new Date(2026, 7, 2)), "2026-08-02");
	assert.equal(todayStamp(new Date(2026, 11, 25)), "2026-12-25");
});
