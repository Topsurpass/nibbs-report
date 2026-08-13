import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detectAmountColumn,
	detectColumns,
	detectCompletionStatusColumn,
	detectResponseCodeColumn,
	extractCode,
	looksLikeInitiator,
	normalizeHeader,
} from "./detectColumns.ts";
import { mergeDirectory } from "./nipDirectory.ts";
import type { Row } from "./types.ts";

const DIR = mergeDirectory();

/** Header shape of fraudulent.xlsx — the code is the cell itself. */
const DIRECT_HEADERS = [
	"Transaction_Date",
	"sender_acc_no",
	"sender",
	"receiver",
	"receiver_acc_no",
	"beneficiary_issuer_code",
	"Amount",
	"transaction_reference",
	"receiver_response_code",
];

/** Header shape of fraudulent_2.xlsx — the code is the first 3 of `reciever`. */
const PREFIX_HEADERS = [
	"created",
	"terminal",
	"action",
	"etzRef",
	"clientRef",
	"respCode",
	"format(a.amount,2)",
	"respmessage",
	"sender_account",
	"destination",
	"reciever",
	"beneficiary",
	"sender",
	"merchant_name",
];

function directRows(): Row[] {
	return [
		{ beneficiary_issuer_code: "C39", Amount: "4,970,000.00", receiver_response_code: "00" },
		{ beneficiary_issuer_code: "044", Amount: "300,000.00", receiver_response_code: "00" },
		{ beneficiary_issuer_code: "B99", Amount: "10,000.00", receiver_response_code: "57" },
	];
}

function prefixRows(): Row[] {
	return [
		{ destination: "3064018987", reciever: "0113064018987", beneficiary: "ALIYU BINTU", respCode: "0" },
		{ destination: "8105655588", reciever: "C038105655588", beneficiary: "JAMILA M", respCode: "0" },
		{ destination: "7012003623", reciever: "B997012003623", beneficiary: "ALEXANDER K", respCode: "0" },
		{ destination: "0025184870", reciever: "0580025184870", beneficiary: "AGBAFOR E", respCode: "0" },
	];
}

test("extractCode — direct mode", () => {
	assert.equal(extractCode("C39", "direct"), "C39");
	assert.equal(extractCode(" c39 ", "direct"), "C39");
	assert.equal(extractCode("044", "direct"), "044");
	// Excel turned "044" into the number 44 — one zero is restored.
	assert.equal(extractCode("44", "direct"), "044");
	assert.equal(extractCode("11", "direct"), "011");
	assert.equal(extractCode("", "direct"), "");
	assert.equal(extractCode("0110", "direct"), "");
	assert.equal(extractCode("3064018987", "direct"), "");
});

test("extractCode — prefix mode takes the first 3 of a 13-char value", () => {
	assert.equal(extractCode("0113064018987", "prefix"), "011");
	assert.equal(extractCode("C038105655588", "prefix"), "C03");
	assert.equal(extractCode("B997012003623", "prefix"), "B99");
	// One lost leading zero is restored (12 chars -> 13).
	assert.equal(extractCode("113064018987", "prefix"), "011");
});

test("extractCode — prefix mode rejects a 10-digit account number", () => {
	// This is the guard that keeps `destination` from being mistaken for a code:
	// padding is capped at one character, so 10 digits can never reach 13.
	assert.equal(extractCode("3064018987", "prefix"), "");
	assert.equal(extractCode("0025184870", "prefix"), "");
	// An 11-digit value is still two short of 13 and stays rejected.
	assert.equal(extractCode("01130640189", "prefix"), "");
});

test("detects beneficiary_issuer_code in the direct-code spool", () => {
	const result = detectColumns(directRows(), DIRECT_HEADERS, DIR);
	assert.ok(result.code, "expected a code column");
	assert.equal(result.code.column, "beneficiary_issuer_code");
	assert.equal(result.code.mode, "direct");
	assert.equal(result.code.matchRate, 1);
	assert.equal(result.code.sampled, 3);
});

test("detects `reciever` — not `destination` — in the prefixed spool", () => {
	const result = detectColumns(prefixRows(), PREFIX_HEADERS, DIR);
	assert.ok(result.code, "expected a code column");
	assert.equal(result.code.column, "reciever");
	assert.equal(result.code.mode, "prefix");
	assert.equal(result.code.matchRate, 1);
	// `destination` holds bare 10-digit accounts and must not be a candidate.
	assert.ok(
		!result.candidates.some((c) => c.column === "destination"),
		`destination was offered as a candidate: ${JSON.stringify(result.candidates)}`,
	);
});

test("prefers the beneficiary column over the initiator column", () => {
	// fraud_escalation.xls carries both. Picking `initiator_issuer_code` would
	// escalate every transaction to the SENDING bank — the worst silent failure
	// this feature can have.
	const headers = ["amount", "beneficiary_issuer_code", "initiator_issuer_code"];
	const rows: Row[] = [
		{ amount: "1000", beneficiary_issuer_code: "C39", initiator_issuer_code: "050" },
		{ amount: "2000", beneficiary_issuer_code: "101", initiator_issuer_code: "050" },
		{ amount: "3000", beneficiary_issuer_code: "044", initiator_issuer_code: "032" },
	];
	const result = detectColumns(rows, headers, DIR);
	assert.ok(result.code);
	assert.equal(result.code.column, "beneficiary_issuer_code");
	assert.equal(result.candidates[0].column, "beneficiary_issuer_code");
	// It stays available in the dropdown, just never auto-selected.
	assert.ok(result.candidates.some((c) => c.column === "initiator_issuer_code"));
});

test("an initiator-only file auto-selects nothing and forces an explicit choice", () => {
	const headers = ["amount", "initiator_issuer_code"];
	const rows: Row[] = [
		{ amount: "1000", initiator_issuer_code: "050" },
		{ amount: "2000", initiator_issuer_code: "032" },
	];
	const result = detectColumns(rows, headers, DIR);
	assert.equal(result.code, null, "sender-side column must not be auto-selected");
	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].column, "initiator_issuer_code");
});

test("returns no code column when nothing in the file resolves", () => {
	const headers = ["date", "narration", "account"];
	const rows: Row[] = [
		{ date: "2026-08-02", narration: "Agency fee", account: "3064018987" },
		{ date: "2026-08-02", narration: "Rent payment", account: "8105655588" },
	];
	const result = detectColumns(rows, headers, DIR);
	assert.equal(result.code, null);
	assert.deepEqual(result.candidates, []);
});

test("resolve floor: half the codes may be unknown, most may not", () => {
	// "ZZZ" is code-shaped but not in the directory, so it clears the shape bar
	// and only counts against the resolve bar.
	const rows = (known: number, unknown: number): Row[] => [
		...Array.from({ length: known }, () => ({ code: "C39" })),
		...Array.from({ length: unknown }, () => ({ code: "ZZZ" })),
	];
	assert.ok(detectColumns(rows(9, 1), ["code"], DIR).code, "9/10 known");
	assert.ok(detectColumns(rows(5, 5), ["code"], DIR).code, "5/10 known is the floor");
	assert.equal(detectColumns(rows(4, 6), ["code"], DIR).code, null, "4/10 known");
});

test("shape floor: a column of mixed-length junk is rejected", () => {
	// Right-ish values but wrong shapes — this is what separates a code column
	// from a free-text one that happens to contain a few codes.
	const rows: Row[] = [
		...Array.from({ length: 6 }, () => ({ code: "C39" })),
		...Array.from({ length: 4 }, () => ({ code: "SOME LONG NARRATION" })),
	];
	assert.equal(detectColumns(rows, ["code"], DIR).code, null);
});

test("the amount column cannot be mistaken for the code column", () => {
	// "100" is both a plausible amount and a real institution code. Whichever
	// column is the amount is off the table as a code carrier.
	const headers = ["amount", "beneficiary_issuer_code"];
	const rows: Row[] = Array.from({ length: 5 }, () => ({
		amount: "100",
		beneficiary_issuer_code: "C39",
	}));
	const result = detectColumns(rows, headers, DIR);
	assert.equal(result.code?.column, "beneficiary_issuer_code");
	assert.ok(!result.candidates.some((c) => c.column === "amount"));
});

test("blank cells are not counted against a column's match rate", () => {
	const rows: Row[] = [
		{ beneficiary_issuer_code: "C39" },
		{ beneficiary_issuer_code: "" },
		{ beneficiary_issuer_code: "   " },
		{ beneficiary_issuer_code: "044" },
	];
	const result = detectColumns(rows, ["beneficiary_issuer_code"], DIR);
	assert.ok(result.code);
	assert.equal(result.code.sampled, 2);
	assert.equal(result.code.matchRate, 1);
});

test("amount / response-code / status headers", () => {
	assert.equal(detectAmountColumn(DIRECT_HEADERS), "Amount");
	assert.equal(detectAmountColumn(PREFIX_HEADERS), "format(a.amount,2)");
	assert.equal(detectAmountColumn(["id", "narration"]), null);
	// An exact "amount" beats a fuzzier match regardless of position.
	assert.equal(detectAmountColumn(["format(a.amount,2)", "amount"]), "amount");

	assert.equal(detectResponseCodeColumn(DIRECT_HEADERS), "receiver_response_code");
	assert.equal(detectResponseCodeColumn(PREFIX_HEADERS), "respCode");
	assert.equal(detectResponseCodeColumn(["id", "amount"]), null);

	assert.equal(detectCompletionStatusColumn(["id", "completion_status"]), "completion_status");
	assert.equal(detectCompletionStatusColumn(["id", "status"]), "status");
	assert.equal(detectCompletionStatusColumn(["id", "amount"]), null);
});

test("normalizeHeader strips punctuation and case", () => {
	assert.equal(normalizeHeader("receiver_response_code"), "receiverresponsecode");
	assert.equal(normalizeHeader("format(a.amount,2)"), "formataamount2");
	assert.equal(normalizeHeader("respCode"), "respcode");
});

test("looksLikeInitiator", () => {
	assert.ok(looksLikeInitiator("initiator_issuer_code"));
	assert.ok(looksLikeInitiator("sender_account"));
	assert.ok(!looksLikeInitiator("beneficiary_issuer_code"));
	assert.ok(!looksLikeInitiator("reciever"));
});
