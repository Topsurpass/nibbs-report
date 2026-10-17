// Pure filtering and grouping for the Daily Schedule list. Kept out of the
// component so the rules (what a search matches, how months are ordered) are
// testable without a DOM.

import type { HandoverType, ScheduleReportListItem } from "./template.ts";

export interface ListFilter {
	/** Free text matched against officer names and the handover type. */
	query: string;
	/** null = every handover type. */
	type: HandoverType | null;
}

export interface MonthGroup {
	/** `YYYY-MM` */
	key: string;
	/** "August 2026" */
	label: string;
	reports: ScheduleReportListItem[];
}

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

/** Case-insensitive; every whitespace-separated term must match somewhere. */
export function filterReports(reports: ScheduleReportListItem[], filter: ListFilter): ScheduleReportListItem[] {
	const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
	return reports.filter((r) => {
		if (filter.type && r.handoverType !== filter.type) return false;
		if (terms.length === 0) return true;
		const haystack = `${r.outgoingOfficers} ${r.incomingOfficers} ${r.handoverType} ${r.reportDate}`.toLowerCase();
		return terms.every((t) => haystack.includes(t));
	});
}

/** Newest month first; within a month, newest report date first (stable for ties). */
export function groupByMonth(reports: ScheduleReportListItem[]): MonthGroup[] {
	const groups = new Map<string, ScheduleReportListItem[]>();
	for (const r of reports) {
		const key = r.reportDate.slice(0, 7);
		groups.set(key, [...(groups.get(key) ?? []), r]);
	}
	return [...groups.entries()]
		.sort((a, b) => b[0].localeCompare(a[0]))
		.map(([key, rows]) => ({
			key,
			label: `${MONTHS[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`,
			reports: [...rows].sort((a, b) => b.reportDate.localeCompare(a.reportDate)),
		}));
}

/** "Seyi Ogunyankinu, Tokunbo Ogunjobi" → ["Seyi Ogunyankinu", "Tokunbo Ogunjobi"]. */
export function splitOfficers(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
