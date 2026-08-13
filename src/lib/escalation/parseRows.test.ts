import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAmount, isSuccessful, parseAmount } from "./parseRows.ts";
import type { DetectedColumns } from "./types.ts";

const NO_COLUMNS: DetectedColumns = {
	code: null,
	candidates: [],
	amount: null,
	responseCode: null,
	completionStatus: null,
};

const withResponse = (column: string): DetectedColumns => ({
	...NO_COLUMNS,
	responseCode: column,
});

test("parseAmount handles every shape the spools emit", () => {
	assert.equal(parseAmount(" 4,990,000.00 "), 4990000);
	assert.equal(parseAmount("4990000.00"), 4990000);
	assert.equal(parseAmount("4990000"), 4990000);
	assert.equal(parseAmount("413,520,000.00"), 413520000);
	assert.equal(parseAmount("₦1,000"), 1000);
	assert.equal(parseAmount(1234.56), 1234.56);
	assert.equal(parseAmount("1234.56"), 1234.56);
});

test("parseAmount keeps kobo rather than truncating", () => {
	// The difference from parseCollateral in lib/importBanks.ts, which floors.
	assert.equal(parseAmount("3,200.75"), 3200.75);
	assert.equal(parseAmount(" 10,000.50 "), 10000.5);
});

test("parseAmount returns 0 for blanks and junk so totals never go NaN", () => {
	assert.equal(parseAmount(""), 0);
	assert.equal(parseAmount("   "), 0);
	assert.equal(parseAmount(" -   "), 0);
	assert.equal(parseAmount("."), 0);
	assert.equal(parseAmount(null), 0);
	assert.equal(parseAmount(undefined), 0);
	assert.equal(parseAmount("N/A"), 0);
	assert.equal(parseAmount(Number.NaN), 0);
	assert.equal(parseAmount(Number.POSITIVE_INFINITY), 0);
});

test("parseAmount keeps a negative (reversal) negative", () => {
	assert.equal(parseAmount("-5,000.00"), -5000);
});

test("formatAmount renders Naira with 2dp", () => {
	assert.equal(formatAmount(4990000), "4,990,000.00");
	assert.equal(formatAmount(0), "0.00");
	assert.equal(formatAmount(3200.5), "3,200.50");
});

test("all-zero response codes are successes, everything else is not", () => {
	const cols = withResponse("receiver_response_code");
	assert.ok(isSuccessful({ receiver_response_code: "00" }, cols));
	assert.ok(isSuccessful({ receiver_response_code: "0" }, cols));
	assert.ok(!isSuccessful({ receiver_response_code: "97" }, cols)); // timeout
	assert.ok(!isSuccessful({ receiver_response_code: "61" }, cols)); // limit exceeded
	assert.ok(!isSuccessful({ receiver_response_code: "57" }, cols)); // not permitted
	assert.ok(!isSuccessful({ receiver_response_code: "30" }, cols)); // format error
});

test("falls back to completion_status when the response code is missing", () => {
	const cols: DetectedColumns = {
		...NO_COLUMNS,
		responseCode: "respCode",
		completionStatus: "completion_status",
	};
	// Blank response code -> use completion_status.
	assert.ok(isSuccessful({ respCode: "", completion_status: "1" }, cols));
	assert.ok(!isSuccessful({ respCode: "", completion_status: "0" }, cols));
	// A present response code wins over completion_status.
	assert.ok(!isSuccessful({ respCode: "97", completion_status: "1" }, cols));
});

test("a row with no success signal at all counts as successful", () => {
	// Better to over-include than to silently drop a transaction from an export
	// shape we have not seen before.
	assert.ok(isSuccessful({ amount: "1000" }, NO_COLUMNS));
	assert.ok(isSuccessful({ respCode: "", completion_status: "" }, {
		...NO_COLUMNS,
		responseCode: "respCode",
		completionStatus: "completion_status",
	}));
});
