import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, type ReconInput } from "./reconcile.ts";
import type { FrameParseResult, FrameRow } from "./parseHtml.ts";
import type { TxtParseResult, FilenameCheck, SmartdetRow, TxtFormatResult } from "./parseTxt.ts";
import type { MasterBank } from "./master.ts";
import { LEGACY_BANK_CODE_MERGES } from "./legacyBankCodes.ts";

const REPORT_DATE = new Date(2026, 6, 22); // 2026-07-22

const emptyFrame: FrameParseResult = {
	rows: [],
	netSum: 0,
	droppedEmpty: 0,
	droppedPocketMoni: 0,
};

const emptyTxt: TxtParseResult = {
	rows: [],
	fileDates: [],
	malformed: 0,
	format: { valid: true, issues: [], checkedLines: 0 },
};

function filenameCheck(sequence: string | undefined): FilenameCheck {
	return {
		ok: sequence !== undefined,
		dateSegment: "22072026",
		sequence,
		matchesReportDate: true,
	};
}

function run(over: Partial<ReconInput>) {
	return reconcile({
		frame: emptyFrame,
		txt: emptyTxt,
		master: [],
		reportDate: REPORT_DATE,
		filenameCheck: filenameCheck("2"),
		...over,
	});
}

const sessionCheck = (r: ReturnType<typeof reconcile>) =>
	r.checks.find((c) => c.id === "nibbs-session")!;

test("session resolves and passes when HTML letter and txt sequence agree", () => {
	const r = run({ htmlFileName: "2026-07-22 B.html", filenameCheck: filenameCheck("2") });
	assert.equal(r.session.label, "11am");
	assert.equal(r.session.match, true);
	const chk = sessionCheck(r);
	assert.equal(chk.status, "pass");
	assert.match(chk.detail, /11am NIBBS/);
});

test("session mismatch fails the check and blocks a confident label", () => {
	const r = run({ htmlFileName: "2026-07-22 C.html", filenameCheck: filenameCheck("2") });
	assert.equal(r.session.label, undefined);
	assert.equal(sessionCheck(r).status, "fail");
	assert.equal(r.hasFailures, true);
});

test("only one source present → warn, not a hard failure", () => {
	const r = run({ htmlFileName: "settlement.html", filenameCheck: filenameCheck("4") });
	assert.equal(r.session.label, "5pm");
	assert.equal(sessionCheck(r).status, "warn");
});

// ---------------------------------------------------------------------------
// Legacy bank-code merges (src/lib/legacyBankCodes.ts).
//
// NIBBS can keep carrying a merged-away bank's old settlement code as its
// own line in the Frame HTML (e.g. Diamond -> Access, 2019), while Smartdet
// already reports the combined bank under its current code only. Without
// folding the legacy code's amount into its primary code for the Jive
// check, the primary code's row would be permanently flagged as mismatched
// by exactly the legacy row's amount on any day it has activity.
const [LEGACY_CODE, PRIMARY_CODE] = Object.entries(LEGACY_BANK_CODE_MERGES)[0];

function frameRow(code: string, name: string, netPosition: number): FrameRow {
	return { bankString: `${name} - ${code}`, name, code, outgoing: 0, incoming: netPosition, netPosition };
}
function smartRow(code: string, amount: number): SmartdetRow {
	return { typeCode: "702", dateStr: "2026/07/22", code, amount };
}
const txtFormat: TxtFormatResult = { valid: true, issues: [], checkedLines: 1 };
const jiveCheck = (r: ReturnType<typeof reconcile>) => r.checks.find((c) => c.id === "jive")!;

test("legacy bank-code merge: Jive check folds the legacy code's Frame amount into its primary code", () => {
	const primaryAmount = 1_000_000;
	const legacyAmount = 250_000;
	const combined = primaryAmount + legacyAmount;

	const frame: FrameParseResult = {
		rows: [
			frameRow(PRIMARY_CODE, "Access Bank Plc", primaryAmount),
			frameRow(LEGACY_CODE, "Access Bank Plc (Diamond)", legacyAmount),
		],
		netSum: combined,
		droppedEmpty: 0,
		droppedPocketMoni: 0,
	};
	const txt: TxtParseResult = {
		rows: [smartRow(PRIMARY_CODE, combined)],
		fileDates: ["22072026"],
		malformed: 0,
		format: txtFormat,
	};
	const master: MasterBank[] = [{ code: PRIMARY_CODE, name: "Access Bank Plc", collateral: 0 }];

	const r = run({ frame, txt, master });

	const jive = jiveCheck(r);
	assert.equal(jive.status, "pass");
	assert.match(jive.detail, /legacy code/i);
	assert.match(jive.detail, new RegExp(LEGACY_CODE));

	const primaryRow = r.rows.find((row) => row.code === PRIMARY_CODE)!;
	assert.equal(primaryRow.jive, 0);
	assert.equal(primaryRow.jiveBreach, false);
	assert.ok(primaryRow.mergeNote?.includes(LEGACY_CODE));

	const legacyRow = r.rows.find((row) => row.code === LEGACY_CODE)!;
	assert.equal(legacyRow.jive, null);
	assert.equal(legacyRow.jiveBreach, false);
	// Its own real figure still shows — the merge is for the check only.
	assert.equal(legacyRow.frameAmount, legacyAmount);
	assert.ok(legacyRow.mergeNote?.includes(PRIMARY_CODE));

	assert.ok(!r.breaches.some((b) => b.code === PRIMARY_CODE || b.code === LEGACY_CODE));
});

test("no legacy codes present → mergeNote absent and Jive detail has no merge mention", () => {
	const frame: FrameParseResult = {
		rows: [frameRow(PRIMARY_CODE, "Access Bank Plc", 100)],
		netSum: 100,
		droppedEmpty: 0,
		droppedPocketMoni: 0,
	};
	const txt: TxtParseResult = {
		rows: [smartRow(PRIMARY_CODE, 100)],
		fileDates: ["22072026"],
		malformed: 0,
		format: txtFormat,
	};
	const master: MasterBank[] = [{ code: PRIMARY_CODE, name: "Access Bank Plc", collateral: 0 }];

	const r = run({ frame, txt, master });

	assert.doesNotMatch(jiveCheck(r).detail, /legacy code/i);
	const row = r.rows.find((x) => x.code === PRIMARY_CODE)!;
	assert.equal(row.mergeNote, null);
});
