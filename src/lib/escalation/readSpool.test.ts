import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { readSpool, SpoolReadError } from "./readSpool.ts";

/**
 * Fixtures are built here rather than committed: the real spools carry live
 * customer names, NUBANs and BVNs and are gitignored. These mirror their exact
 * header shapes. The real files are covered by `npm run eval:escalation`.
 */

function workbook(sheets: Record<string, unknown[][]>): Buffer {
	const wb = XLSX.utils.book_new();
	for (const [name, aoa] of Object.entries(sheets)) {
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
	}
	return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("reads headers and rows from the first populated sheet", () => {
	const buf = workbook({
		Sheet1: [
			["Transaction_Date", "beneficiary_issuer_code", "Amount"],
			["2026-08-02 18:51:31", "C39", "4,970,000.00"],
			["2026-08-02 18:42:24", "044", "490,000.00"],
		],
	});
	const spool = readSpool(buf);
	assert.deepEqual(spool.headers, ["Transaction_Date", "beneficiary_issuer_code", "Amount"]);
	assert.equal(spool.rows.length, 2);
	assert.equal(spool.rows[0].beneficiary_issuer_code, "C39");
	assert.equal(spool.rows[1].Amount, "490,000.00");
	assert.equal(spool.sheetName, "Sheet1");
});

test("skips a header-only leading sheet and reports every sheet name", () => {
	const buf = workbook({
		Cover: [["Details"]],
		Data: [
			["code", "amount"],
			["C39", "100"],
		],
	});
	const spool = readSpool(buf);
	assert.equal(spool.sheetName, "Data");
	assert.deepEqual(spool.sheetNames, ["Cover", "Data"]);
	assert.equal(spool.rows.length, 1);
});

test("an explicitly requested sheet wins", () => {
	const buf = workbook({
		A: [
			["code"],
			["C39"],
		],
		B: [
			["code"],
			["044"],
		],
	});
	assert.equal(readSpool(buf, "B").rows[0].code, "044");
	// An unknown name falls back to the automatic pick rather than throwing.
	assert.equal(readSpool(buf, "nope").sheetName, "A");
});

test("blank rows are dropped, blank cells become empty strings", () => {
	const buf = workbook({
		Sheet1: [
			["code", "amount", "note"],
			["C39", "100", ""],
			["", "", ""],
			["044", "200", "x"],
		],
	});
	const spool = readSpool(buf);
	assert.equal(spool.rows.length, 2);
	assert.equal(spool.rows[0].note, "");
	assert.equal(spool.rows[1].code, "044");
});

test("unnamed and duplicate headers are made addressable", () => {
	const buf = workbook({
		Sheet1: [
			["code", "", "code"],
			["C39", "x", "044"],
		],
	});
	const spool = readSpool(buf);
	assert.deepEqual(spool.headers, ["code", "Column 2", "code (2)"]);
	assert.equal(spool.rows[0]["code"], "C39");
	assert.equal(spool.rows[0]["code (2)"], "044");
});

test("cells arrive as trimmed strings, preserving codes that look numeric", () => {
	const ws = XLSX.utils.aoa_to_sheet([
		["code", "amount"],
		["011", "100"],
	]);
	// Force the code cell to be stored as text, the way the real export does.
	ws["A2"] = { t: "s", v: "011" };
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
	const spool = readSpool(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
	assert.equal(spool.rows[0].code, "011");
});

test("an empty sheet raises SpoolReadError", () => {
	assert.throws(() => readSpool(workbook({ Sheet1: [] })), SpoolReadError);
});

test("a header row with no data rows raises SpoolReadError", () => {
	assert.throws(() => readSpool(workbook({ Sheet1: [["code", "amount"]] })), SpoolReadError);
});

test("bytes that are not a spreadsheet raise SpoolReadError", () => {
	// SheetJS does not reject unknown input — it reads arbitrary bytes as
	// delimited text and hands back a junk single-column sheet. Without the
	// no-rows guard, dropping a PDF here would show an empty preview instead of
	// an error.
	assert.throws(() => readSpool(new Uint8Array([0x00, 0x01, 0x02, 0x03])), SpoolReadError);
	assert.throws(
		() => readSpool(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00])),
		SpoolReadError,
	);
});

test("accepts an ArrayBuffer as well as a Uint8Array", () => {
	const buf = workbook({ Sheet1: [["code"], ["C39"]] });
	const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
	assert.equal(readSpool(ab).rows[0].code, "C39");
});
