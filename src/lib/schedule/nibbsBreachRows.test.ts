import { test } from "node:test";
import assert from "node:assert/strict";
import type { BreachRecord } from "../reconcile.ts";
import type { ScheduleReport, SummaryRow } from "./template.ts";
import { blankReport } from "./template.ts";
import {
	buildNibbsBreachRows,
	mergeSummaryRows,
	applyNibbsBreachRows,
	BREACH_ROW_STATUS,
} from "./nibbsBreachRows.ts";

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

const row = (id: string, detail: string, findings: string): SummaryRow => ({
	id,
	detail,
	findings,
	status: "Pending",
});

// ---- buildNibbsBreachRows ----

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

// ---- mergeSummaryRows ----

test("mergeSummaryRows appends new rows and preserves order", () => {
	const existing = [row("a", "8am NIBBS", "A breached")];
	const incoming = [row("b", "11am NIBBS", "B breached"), row("c", "2pm NIBBS", "C breached")];
	assert.deepEqual(
		mergeSummaryRows(existing, incoming).map((r) => r.detail),
		["8am NIBBS", "11am NIBBS", "2pm NIBBS"],
	);
});

test("mergeSummaryRows dedupes by (detail, findings), ignoring id", () => {
	const existing = [row("a", "11am NIBBS", "Access Bank breached")];
	const incoming = [row("z", "11am NIBBS", "Access Bank breached")];
	assert.equal(mergeSummaryRows(existing, incoming).length, 1);
});

test("mergeSummaryRows keeps the same bank across different sessions", () => {
	const existing = [row("a", "8am NIBBS", "Access Bank breached")];
	const incoming = [row("b", "11am NIBBS", "Access Bank breached")];
	assert.equal(mergeSummaryRows(existing, incoming).length, 2);
});

// ---- applyNibbsBreachRows ----

function report(): ScheduleReport {
	return blankReport({ date: "2026-07-22", outgoingOfficers: "Ada A" });
}

test("default NIBSS category starts with no rows", () => {
	const cat = report().summary.find((c) => c.id === "nibss")!;
	assert.deepEqual(cat.rows, []);
});

test("appends breach rows into the existing nibss category", () => {
	const rows = buildNibbsBreachRows([breach("4000470158", "Access Bank")], "11am");
	const { report: out, added } = applyNibbsBreachRows(report(), rows);
	assert.equal(added, 1);
	const cat = out.summary.find((c) => c.id === "nibss")!;
	assert.ok(cat.rows.some((r) => r.detail === "11am NIBBS" && r.findings === "Access Bank breached"));
});

test("re-applying the same breach is a no-op (added 0)", () => {
	const rows = buildNibbsBreachRows([breach("4000470158", "Access Bank")], "11am");
	const first = applyNibbsBreachRows(report(), rows);
	const second = applyNibbsBreachRows(first.report, rows);
	assert.equal(second.added, 0);
	const cat = second.report.summary.find((c) => c.id === "nibss")!;
	assert.equal(cat.rows.filter((r) => r.findings === "Access Bank breached").length, 1);
});

test("creates a nibss category when the report has none", () => {
	const base = report();
	base.summary = base.summary.filter((c) => c.id !== "nibss");
	assert.equal(base.summary.some((c) => c.id === "nibss"), false);

	const rows = buildNibbsBreachRows([breach("4000470158", "Access Bank")], "2pm");
	const { report: out, added } = applyNibbsBreachRows(base, rows);
	assert.equal(added, 1);
	const cat = out.summary.find((c) => c.id === "nibss");
	assert.ok(cat, "nibss category was created");
	assert.ok(cat!.rows.some((r) => r.detail === "2pm NIBBS"));
});
