import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, type ReconInput } from "./reconcile.ts";
import type { FrameParseResult } from "./parseHtml.ts";
import type { TxtParseResult, FilenameCheck } from "./parseTxt.ts";

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
