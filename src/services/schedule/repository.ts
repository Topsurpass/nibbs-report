import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import type { ScheduleReport, ScheduleReportListItem } from "@/lib/schedule/template";

/**
 * Persistence for daily schedule (handover) reports. The full document lives in
 * a JSONB column; a few denormalized columns (date, shift, officers) are lifted
 * from `report.cover` on write so the list view can sort without parsing JSON.
 */

interface ListRow {
	id: string;
	report_date: string;
	handover_type: string;
	outgoing_officers: string;
	incoming_officers: string;
	created_at: string;
}

interface FullRow extends ListRow {
	data: ScheduleReport;
	updated_at: string;
}

function toListItem(r: ListRow): ScheduleReportListItem {
	return {
		id: r.id,
		reportDate: r.report_date,
		handoverType: r.handover_type,
		outgoingOfficers: r.outgoing_officers,
		incomingOfficers: r.incoming_officers,
		createdAt: r.created_at,
	};
}

export interface StoredReport extends ScheduleReportListItem {
	data: ScheduleReport;
	updatedAt: string;
}

function toStored(r: FullRow): StoredReport {
	return { ...toListItem(r), data: r.data, updatedAt: r.updated_at };
}

// `report_date` is a Postgres DATE; the neon driver would otherwise return it as
// a timezone-shifted JS Date, so all reads cast it to text (the literal
// "YYYY-MM-DD" that was stored).

export async function listReports(): Promise<ScheduleReportListItem[]> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select id, report_date::text as report_date, handover_type,
			       outgoing_officers, incoming_officers, created_at
			from nibbs_schedule_reports
			order by report_date desc, created_at desc
		`,
	)) as ListRow[];
	return rows.map(toListItem);
}

export async function getReport(id: string): Promise<StoredReport | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select id, report_date::text as report_date, handover_type, outgoing_officers,
			       incoming_officers, data, created_at, updated_at
			from nibbs_schedule_reports where id = ${id} limit 1
		`,
	)) as FullRow[];
	return rows[0] ? toStored(rows[0]) : null;
}

export async function getLatestReport(): Promise<StoredReport | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select id, report_date::text as report_date, handover_type, outgoing_officers,
			       incoming_officers, data, created_at, updated_at
			from nibbs_schedule_reports
			order by report_date desc, created_at desc limit 1
		`,
	)) as FullRow[];
	return rows[0] ? toStored(rows[0]) : null;
}

export async function createReport(
	report: ScheduleReport,
	userId: string,
): Promise<StoredReport> {
	const sql = requireSql();
	const c = report.cover;
	const rows = (await withRetry(
		() => sql`
			insert into nibbs_schedule_reports
				(report_date, handover_type, outgoing_officers, incoming_officers, data, created_by)
			values
				(${c.date}, ${c.handoverType}, ${c.outgoingOfficers}, ${c.incomingOfficers},
				 ${JSON.stringify(report)}::jsonb, ${userId})
			returning id, report_date::text as report_date, handover_type,
			          outgoing_officers, incoming_officers, data, created_at, updated_at
		`,
	)) as FullRow[];
	return toStored(rows[0]);
}

export async function updateReport(
	id: string,
	report: ScheduleReport,
): Promise<StoredReport | null> {
	const sql = requireSql();
	const c = report.cover;
	const rows = (await withRetry(
		() => sql`
			update nibbs_schedule_reports
			set report_date = ${c.date},
			    handover_type = ${c.handoverType},
			    outgoing_officers = ${c.outgoingOfficers},
			    incoming_officers = ${c.incomingOfficers},
			    data = ${JSON.stringify(report)}::jsonb,
			    updated_at = now()
			where id = ${id}
			returning id, report_date::text as report_date, handover_type,
			          outgoing_officers, incoming_officers, data, created_at, updated_at
		`,
	)) as FullRow[];
	return rows[0] ? toStored(rows[0]) : null;
}

export async function deleteReport(id: string): Promise<void> {
	const sql = requireSql();
	await withRetry(() => sql`delete from nibbs_schedule_reports where id = ${id}`);
}

/** Owner (or admin) check for delete — returns the creator id, or null. */
export async function getReportOwner(id: string): Promise<string | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select created_by from nibbs_schedule_reports where id = ${id} limit 1`,
	)) as { created_by: string | null }[];
	return rows[0]?.created_by ?? null;
}
