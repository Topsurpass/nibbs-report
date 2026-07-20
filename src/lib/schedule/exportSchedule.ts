import * as XLSX from "xlsx";
import type { HandoverType, ScheduleReport } from "./template";

/**
 * Renders a ScheduleReport back into the 4-tab Excel workbook it came from.
 * `buildScheduleSheets` is pure (arrays-of-arrays + merge ranges) so it is
 * unit-testable without SheetJS; `buildScheduleWorkbook` assembles the sheets
 * and `downloadScheduleExcel` writes the file in the browser.
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

export function buildScheduleSheets(report: ScheduleReport): SheetData {
	const { cover, summary, fraudAlerts, recommendations } = report;

	// --- Cover page (label | value | help text) ---
	const coverAoa: Cell[][] = [
		["Department", cover.department, ""],
		["Handover Type", `☐ ${cover.handoverType}`, "Specify the shift transition type."],
		["Date", coverDate(cover.date), "The date of the handover."],
		["Outgoing Officer(s)", cover.outgoingOfficers, "Name(s) of the team member(s) ending the shift."],
		["Incoming Officer(s)", cover.incomingOfficers, "Name(s) of the team member(s) starting the shift."],
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
		...fraudAlerts.map((a) => [
			a.timeLogged,
			a.caseRef,
			a.description,
			a.status,
			a.escalatedTo,
			a.remarks,
		]),
	];

	// --- Recommendations ---
	const recsAoa: Cell[][] = [
		["", "Suggestions or tips for smooth transition or priority actions for the incoming shift."],
		["S/N", "Recommendation Items"],
		...recommendations.map((rec, i) => [i + 1, rec.text]),
	];

	return {
		cover: coverAoa,
		summary: { aoa: summaryAoa, merges },
		fraud: fraudAoa,
		recs: recsAoa,
	};
}

export function buildScheduleWorkbook(report: ScheduleReport): XLSX.WorkBook {
	const data = buildScheduleSheets(report);
	const wb = XLSX.utils.book_new();

	const coverWs = XLSX.utils.aoa_to_sheet(data.cover);
	coverWs["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 48 }];
	XLSX.utils.book_append_sheet(wb, coverWs, SHEET_NAMES.cover);

	const summaryWs = XLSX.utils.aoa_to_sheet(data.summary.aoa);
	summaryWs["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 40 }, { wch: 40 }, { wch: 32 }];
	summaryWs["!merges"] = data.summary.merges.map((m) => XLSX.utils.decode_range(m));
	XLSX.utils.book_append_sheet(wb, summaryWs, SHEET_NAMES.summary);

	const fraudWs = XLSX.utils.aoa_to_sheet(data.fraud);
	fraudWs["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
	XLSX.utils.book_append_sheet(wb, fraudWs, SHEET_NAMES.fraud);

	const recsWs = XLSX.utils.aoa_to_sheet(data.recs);
	recsWs["!cols"] = [{ wch: 6 }, { wch: 60 }];
	XLSX.utils.book_append_sheet(wb, recsWs, SHEET_NAMES.recs);

	return wb;
}

export function scheduleFileName(report: ScheduleReport): string {
	return `DAILY_SCHEDULE_REPORT_${ddmmyyyy(report.cover.date)}_${shiftSlug(
		report.cover.handoverType,
	)}.xlsx`;
}

/** Build and download the workbook (browser). */
export function downloadScheduleExcel(report: ScheduleReport): void {
	XLSX.writeFile(buildScheduleWorkbook(report), scheduleFileName(report));
}
