import { test } from "node:test";
import assert from "node:assert/strict";
import type { BreachRecord } from "../reconcile.ts";
import { buildNibbsBreachRows, BREACH_ROW_STATUS } from "./nibbsBreachRows.ts";

function breach(code: string, name: string, kind: BreachRecord["kind"] = "collateral"): BreachRecord {
	return {
		code,
		name,
		kind,
		netSettlementPosition: -1000,
		collateral: 500,
		variance: -500,
		status: "UNACCEPTABLE",
		reason: "SwitchIT transfers",
	};
}

test("one row per breached bank, labelled with the session", () => {
	const rows = buildNibbsBreachRows(
		[breach("4000470158", "Access Bank"), breach("5000010001", "Zenith Bank")],
		"11am",
	);
	assert.equal(rows.length, 2);
	assert.deepEqual(
		rows.map((r) => ({ detail: r.detail, findings: r.findings, status: r.status })),
		[
			{ detail: "11am NIBBS", findings: "Access Bank breached", status: BREACH_ROW_STATUS },
			{ detail: "11am NIBBS", findings: "Zenith Bank breached", status: BREACH_ROW_STATUS },
		],
	);
});

test("dedupes a bank that breaches on both collateral and reconciliation", () => {
	const rows = buildNibbsBreachRows(
		[breach("4000470158", "Access Bank", "collateral"), breach("4000470158", "Access Bank", "reconciliation")],
		"8am",
	);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].findings, "Access Bank breached");
});

test("stable, deterministic ids for the same session + bank", () => {
	const a = buildNibbsBreachRows([breach("4000470158", "Access Bank")], "2pm");
	const b = buildNibbsBreachRows([breach("4000470158", "Access Bank")], "2pm");
	assert.equal(a[0].id, b[0].id);
	assert.equal(a[0].id, "nibbs-breach-2pm-4000470158");
});

test("no breaches → no rows", () => {
	assert.deepEqual(buildNibbsBreachRows([], "5pm"), []);
});
