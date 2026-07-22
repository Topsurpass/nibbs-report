// Turn reconciliation breaches into NIBSS summary rows for the daily report, and
// merge them into a report's "nibss" category.
//
// A breach in the Settlement Auditor becomes one summary row per breached bank:
//   detail   = "11am NIBBS"        (the settlement session)
//   findings = "Access Bank breached"
//   status   = "Pending"
// so the analyst never retypes bank names or sessions into the handover report.

import type { BreachRecord } from "@/lib/reconcile";
import type { ScheduleReport, SummaryRow } from "@/lib/schedule/template";
import { nibss } from "./template.ts";
import { sessionRowLabel, type SessionLabel } from "../session/nibbsSession.ts";

/** Status carried onto generated rows — an open item awaiting sign-off. */
export const BREACH_ROW_STATUS = "Pending";

/** Slug a session label for a stable, collision-free row id (e.g. "11am"→"11am"). */
function sessionSlug(label: SessionLabel): string {
	return label.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Build NIBSS summary rows from breaches for one settlement session. One row per
 * distinct bank (deduped by code); ids are deterministic so repeated builds for the
 * same session/bank collapse rather than pile up.
 */
export function buildNibbsBreachRows(
	breaches: Pick<BreachRecord, "code" | "name">[],
	session: SessionLabel,
): SummaryRow[] {
	const detail = sessionRowLabel(session);
	const seen = new Set<string>();
	const rows: SummaryRow[] = [];
	for (const b of breaches) {
		if (seen.has(b.code)) continue;
		seen.add(b.code);
		rows.push({
			id: `nibbs-breach-${sessionSlug(session)}-${b.code}`,
			detail,
			findings: `${b.name} breached`,
			status: BREACH_ROW_STATUS,
		});
	}
	return rows;
}

/** Identity of a row for dedupe — the session + finding text, not the id. */
const rowKey = (r: SummaryRow) => `${r.detail}||${r.findings}`;

/**
 * Merge incoming rows into existing, appending only rows whose (detail, findings)
 * pair isn't already present. Existing order is preserved; new rows go to the end.
 */
export function mergeSummaryRows(existing: SummaryRow[], incoming: SummaryRow[]): SummaryRow[] {
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

/**
 * Apply breach rows to a report's NIBSS summary category, creating the category if
 * absent. Returns a new report and the count of rows actually added (post-dedupe),
 * so callers can report "added N" and detect no-ops.
 */
export function applyNibbsBreachRows(
	report: ScheduleReport,
	rows: SummaryRow[],
): { report: ScheduleReport; added: number } {
	let added = 0;

	const hasNibss = report.summary.some((c) => c.id === "nibss");
	const summary = hasNibss
		? report.summary.map((c) => {
				if (c.id !== "nibss") return c;
				const merged = mergeSummaryRows(c.rows, rows);
				added = merged.length - c.rows.length;
				return { ...c, rows: merged };
			})
		: (() => {
				const cat = nibss();
				const merged = mergeSummaryRows(cat.rows, rows);
				added = merged.length - cat.rows.length;
				return [...report.summary, { ...cat, rows: merged }];
			})();

	return { report: { ...report, summary }, added };
}
