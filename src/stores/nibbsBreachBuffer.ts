// Client-side hand-off buffer for NIBSS breach rows.
//
// The Settlement Auditor and the daily-report editor are separate screens. When an
// analyst clicks "Add breaches to daily report", the generated NIBSS rows are parked
// here (localStorage, keyed by report date) so they survive tab switches across the
// shift. The report editor drains the buffer for its date on mount, then clears it.

import type { SummaryRow } from "@/lib/schedule/template";

const PREFIX = "nibbs:breach-buffer:";

const keyFor = (date: string) => `${PREFIX}${date}`;

/** Identity of a row for dedupe — the session + finding text, not the id. */
const rowKey = (r: SummaryRow) => `${r.detail}||${r.findings}`;

/**
 * Merge incoming rows into existing, appending only rows whose (detail, findings)
 * pair isn't already present. Pure — no storage — so it's unit-testable.
 */
export function mergeRows(existing: SummaryRow[], incoming: SummaryRow[]): SummaryRow[] {
	const seen = new Set(existing.map(rowKey));
	const merged = [...existing];
	for (const r of incoming) {
		const k = rowKey(r);
		if (seen.has(k)) continue;
		seen.add(k);
		merged.push(r);
	}
	return merged;
}

function canUseStorage(): boolean {
	return typeof window !== "undefined" && !!window.localStorage;
}

/** Read the buffered rows for a date (empty when none / storage unavailable). */
export function getBreachRows(date: string): SummaryRow[] {
	if (!canUseStorage()) return [];
	try {
		const raw = window.localStorage.getItem(keyFor(date));
		if (!raw) return [];
		const parsed = JSON.parse(raw) as SummaryRow[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Append rows to the buffer for a date, deduped. Returns the resulting count. */
export function addBreachRows(date: string, rows: SummaryRow[]): number {
	if (!canUseStorage()) return 0;
	const merged = mergeRows(getBreachRows(date), rows);
	try {
		window.localStorage.setItem(keyFor(date), JSON.stringify(merged));
	} catch {
		/* quota / disabled storage — best effort */
	}
	return merged.length;
}

/** Clear the buffer for a date (after the editor has drained it). */
export function clearBreachRows(date: string): void {
	if (!canUseStorage()) return;
	try {
		window.localStorage.removeItem(keyFor(date));
	} catch {
		/* ignore */
	}
}
