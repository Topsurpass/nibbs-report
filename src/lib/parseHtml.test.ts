import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBank } from "./parseHtml.ts";

// parseSettlementHtml itself needs a browser DOMParser this project's plain
// Node test runner doesn't provide — splitBank is the pure, directly
// testable unit the actual bug (a dropped Frame row) lives in.

test("splitBank parses a normal 'Name - code' bank cell", () => {
	assert.deepEqual(splitBank("Access Bank plc - 4000470158"), {
		name: "Access Bank plc",
		code: "4000470158",
	});
});

test("splitBank extracts the code even with a non-digit prefix (the actual bug)", () => {
	// NIBBS marks some legacy/merged settlement codes with a "###" prefix in
	// the Frame HTML export. The old `/^\d{6,}$/` check failed this whole
	// token and silently dropped the row (and its amount) from every sum.
	assert.deepEqual(splitBank("Access Bank Plc (Diamond) - ###4000630109"), {
		name: "Access Bank Plc (Diamond)",
		code: "4000630109",
	});
});

test("splitBank still returns an empty code for genuinely non-numeric trailing text", () => {
	assert.deepEqual(splitBank("Some Row - Not A Code"), {
		name: "Some Row - Not A Code",
		code: "",
	});
});

test("splitBank handles a bank name that itself contains ' - '", () => {
	assert.deepEqual(splitBank("First City Monument Bank - Plc - 4010100137"), {
		name: "First City Monument Bank - Plc",
		code: "4010100137",
	});
});
