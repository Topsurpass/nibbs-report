import { test } from "node:test";
import assert from "node:assert/strict";
import type { SummaryRow } from "@/lib/schedule/template";
import { mergeRows } from "./nibbsBreachBuffer.ts";

const row = (id: string, detail: string, findings: string): SummaryRow => ({
	id,
	detail,
	findings,
	status: "Pending",
});

test("appends new rows to existing", () => {
	const existing = [row("a", "8am NIBBS", "Access Bank breached")];
	const incoming = [row("b", "11am NIBBS", "Zenith Bank breached")];
	const merged = mergeRows(existing, incoming);
	assert.equal(merged.length, 2);
	assert.deepEqual(
		merged.map((r) => r.findings),
		["Access Bank breached", "Zenith Bank breached"],
	);
});

test("dedupes by (detail, findings), ignoring id", () => {
	const existing = [row("a", "11am NIBBS", "Access Bank breached")];
	// Same session + finding, different id → not appended twice.
	const incoming = [row("different-id", "11am NIBBS", "Access Bank breached")];
	const merged = mergeRows(existing, incoming);
	assert.equal(merged.length, 1);
});

test("same bank in two different sessions are both kept", () => {
	const existing = [row("a", "8am NIBBS", "Access Bank breached")];
	const incoming = [row("b", "11am NIBBS", "Access Bank breached")];
	assert.equal(mergeRows(existing, incoming).length, 2);
});

test("preserves order: existing first, then new", () => {
	const existing = [row("a", "8am NIBBS", "A breached")];
	const incoming = [row("b", "11am NIBBS", "B breached"), row("c", "2pm NIBBS", "C breached")];
	const merged = mergeRows(existing, incoming);
	assert.deepEqual(
		merged.map((r) => r.detail),
		["8am NIBBS", "11am NIBBS", "2pm NIBBS"],
	);
});
