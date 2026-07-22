// Turn reconciliation breaches into NIBSS summary rows for the daily report.
//
// A breach in the Settlement Auditor becomes one summary row per breached bank:
//   detail   = "11am NIBBS"        (the settlement session)
//   findings = "Access Bank breached"
//   status   = "Pending"
// so the analyst never retypes bank names or sessions into the handover report.

import type { BreachRecord } from "@/lib/reconcile";
import type { SummaryRow } from "@/lib/schedule/template";
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
	breaches: BreachRecord[],
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
