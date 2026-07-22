import { test } from "node:test";
import assert from "node:assert/strict";
import type { SummaryRow } from "@/lib/schedule/template";
import {
	mergeRows,
	addBreachRows,
	getBreachRows,
	clearBreachRows,
	pendingBreachDates,
} from "./nibbsBreachBuffer.ts";

// Minimal in-memory localStorage so the storage-backed functions are testable.
class MemoryStorage {
	private map = new Map<string, string>();
	get length() {
		return this.map.size;
	}
	key(i: number): string | null {
		return [...this.map.keys()][i] ?? null;
	}
	getItem(k: string): string | null {
		return this.map.has(k) ? this.map.get(k)! : null;
	}
	setItem(k: string, v: string): void {
		this.map.set(k, v);
	}
	removeItem(k: string): void {
		this.map.delete(k);
	}
}

function withStorage(fn: () => void) {
	const g = globalThis as { window?: unknown };
	const prev = g.window;
	g.window = { localStorage: new MemoryStorage() };
	try {
		fn();
	} finally {
		g.window = prev;
	}
}

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

test("storage round-trip: add, read, and dedupe per date", () => {
	withStorage(() => {
		addBreachRows("2026-07-22", [row("a", "11am NIBBS", "Access Bank breached")]);
		addBreachRows("2026-07-22", [row("b", "11am NIBBS", "Access Bank breached")]); // dupe
		addBreachRows("2026-07-22", [row("c", "2pm NIBBS", "Zenith Bank breached")]);
		const rows = getBreachRows("2026-07-22");
		assert.equal(rows.length, 2);
		assert.deepEqual(
			rows.map((r) => r.findings),
			["Access Bank breached", "Zenith Bank breached"],
		);
	});
});

test("pendingBreachDates lists only dates with queued rows, sorted", () => {
	withStorage(() => {
		addBreachRows("2026-07-22", [row("a", "11am NIBBS", "A breached")]);
		addBreachRows("2026-07-20", [row("b", "8am NIBBS", "B breached")]);
		assert.deepEqual(pendingBreachDates(), ["2026-07-20", "2026-07-22"]);
	});
});

test("clearBreachRows removes a date's buffer (drops it from pending)", () => {
	withStorage(() => {
		addBreachRows("2026-07-22", [row("a", "11am NIBBS", "A breached")]);
		clearBreachRows("2026-07-22");
		assert.deepEqual(getBreachRows("2026-07-22"), []);
		assert.deepEqual(pendingBreachDates(), []);
	});
});

test("no storage (SSR) → safe no-ops", () => {
	const g = globalThis as { window?: unknown };
	const prev = g.window;
	g.window = undefined;
	try {
		assert.equal(addBreachRows("2026-07-22", [row("a", "x", "y")]), 0);
		assert.deepEqual(getBreachRows("2026-07-22"), []);
		assert.deepEqual(pendingBreachDates(), []);
	} finally {
		g.window = prev;
	}
});
