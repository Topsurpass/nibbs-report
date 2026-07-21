import type { HandoverType, ScheduleReport } from "./template";

/**
 * Pure content model for the 4-tab schedule workbook: arrays-of-arrays plus the
 * merge ranges. Kept free of any Excel library so it is unit-testable; the
 * styled workbook is assembled from this by `src/lib/schedule/excel.ts` (exceljs,
 * server-side).
 */

type Cell = string | number;

export interface SheetData {
	cover: Cell[][];
	summary: { aoa: Cell[][]; merges: string[] };
	fraud: Cell[][];
	recs: Cell[][];
}

export const SHEET_NAMES = {
	cover: "Cover page",
	summary: "Report Summary",
	fraud: "Fraud Alerts - Incidents Logged",
	recs: "Recommendations-Pending Actions",
} as const;

/** "YYYY-MM-DD" -> "D/M/YYYY" (matches the sample's "20/7/2026"). */
export function coverDate(date: string): string {
	const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return date;
	return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

/** "YYYY-MM-DD" -> "ddmmyyyy" for filenames. */
export function ddmmyyyy(date: string): string {
	const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return date.replace(/\D/g, "");
	return `${m[3]}${m[2]}${m[1]}`;
}

/** "Afternoon to Night" -> "Afternoon_Night". */
export function shiftSlug(handoverType: HandoverType | string): string {
	return handoverType.replace(/\s+to\s+/i, "_").replace(/\s+/g, "_");
}

const officers = (list: string[]): string => (list ?? []).filter(Boolean).join(", ");

export function buildScheduleSheets(report: ScheduleReport): SheetData {
	const { cover, summary, fraudAlerts, recommendations } = report;

	// --- Cover page (label | value | help text) ---
	const coverAoa: Cell[][] = [
		["Department", cover.department, ""],
		["Handover Type", `☐ ${cover.handoverType}`, "Specify the shift transition type."],
		["Date", coverDate(cover.date), "The date of the handover."],
		["Outgoing Officer(s)", officers(cover.outgoingOfficers), "Name(s) of the team member(s) ending the shift."],
		["Incoming Officer(s)", officers(cover.incomingOfficers), "Name(s) of the team member(s) starting the shift."],
		["Time of Handover", cover.timeOfHandover, "Exact time the handover took place."],
		["Outgoing Officer’s Signature", "", "Signature of the officer ending the shift."],
		["Incoming Officer’s Signature", "", "Signature of the officer beginning the shift."],
	];

	// --- Report Summary (title, header, then merged category blocks) ---
	const summaryAoa: Cell[][] = [
		["DAILY SCHEDULE REPORT", "", "", "", ""],
		["TASK", "Details", "Description", "SUMMARY/FINDINGS", "Status"],
	];
	const merges: string[] = ["A1:E1"];
	let r = summaryAoa.length; // 0-based index of the next row to write (== row 2)
	for (const cat of summary) {
		const rows = cat.rows.length > 0 ? cat.rows : [{ id: "", detail: "", findings: "", status: "" }];
		rows.forEach((row, i) => {
			summaryAoa.push([
				i === 0 ? cat.task : "",
				row.detail,
				i === 0 ? cat.description : "",
				row.findings,
				row.status,
			]);
		});
		if (rows.length > 1) {
			const top = r + 1; // Excel is 1-based
			const bottom = r + rows.length;
			merges.push(`A${top}:A${bottom}`); // TASK column
			merges.push(`C${top}:C${bottom}`); // Description column
		}
		r += rows.length;
	}

	// --- Fraud Alerts ---
	const fraudAoa: Cell[][] = [
		["", "", "Use this to log any fraud incidents detected.", "", "", ""],
		["Time Logged", "Case Reference/ID", "Description", "Status", "Escalated To", "Remarks"],
		...fraudAlerts.map((a) => [a.timeLogged, a.caseRef, a.description, a.status, a.escalatedTo, a.remarks]),
	];

	// --- Recommendations ---
	const recsAoa: Cell[][] = [
		["", "Suggestions or tips for smooth transition or priority actions for the incoming shift."],
		["S/N", "Recommendation Items"],
		...recommendations.map((rec, i) => [i + 1, rec.text]),
	];

	return { cover: coverAoa, summary: { aoa: summaryAoa, merges }, fraud: fraudAoa, recs: recsAoa };
}

export function scheduleFileName(report: ScheduleReport): string {
	return `DAILY_SCHEDULE_REPORT_${ddmmyyyy(report.cover.date)}_${shiftSlug(
		report.cover.handoverType,
	)}.xlsx`;
}
