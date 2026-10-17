import {
	formatDuration,
	formatLagosTime,
	formatMonth,
	formatNightLabel,
	toLagos,
	type MonthKey,
} from "./nightWindow.ts";
import {
	entryMinutes,
	personName,
	sortEntries,
	summarizeMonth,
	totalsOf,
	withNights,
} from "./summary.ts";
import { SHIFT_META, type Shift } from "./shifts.ts";
import type { AttendanceEntry, AttendancePerson } from "./types.ts";

/**
 * Pure content model for the duty exports (one shift per file: night or afternoon).
 *
 * Same split as `lib/schedule/exportSchedule.ts` → `lib/schedule/excel.ts`: this
 * decides *what* the workbook says and is fully unit-testable, the exceljs
 * painter decides only how it looks. The JPEG summary is built from the same
 * model, so the picture and the spreadsheet can never report different totals.
 */

export type Cell = string | number;

export interface SheetModel {
	name: string;
	/** Column widths, in exceljs character units. */
	widths: number[];
	/** Row index (1-based) of the table's header row. */
	headerRow: number;
	/** Row index (1-based) of the bold totals row, when the sheet has one. */
	totalsRow?: number;
	aoa: Cell[][];
}

export interface AttendanceExport {
	title: string;
	summary: SheetModel;
	nights: SheetModel;
	fileName: string;
}

/** `"2026-09-04 22:47"` in Lagos. */
export function formatLagosStamp(iso: string | null): string {
	if (!iso) return "—";
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return "—";
	return `${toLagos(at).date} ${formatLagosTime(at)}`;
}

function slug(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "user"
	);
}

export interface ExportInput {
	month: MonthKey;
	people: AttendancePerson[];
	entries: AttendanceEntry[];
	/** Whose register this is: one analyst, or the whole team. */
	scope: "me" | "all";
	/** Which shift these entries are. Defaults to night. */
	shift?: Shift;
	/** When the file was produced, for the footer. */
	generatedAt: Date;
}

function summaryHeader(shift: Shift): string[] {
	const m = SHIFT_META[shift];
	return ["Analyst", "Email", m.plural, "Signed out", "Still open", "Total hours", `Average per ${m.noun}`];
}

function detailHeader(shift: Shift): string[] {
	return [SHIFT_META[shift].label, "Analyst", "Signed in", "Signed out", "Hours", "Source", "Note"];
}

/** Night keeps its original wording; afternoon names the shift. */
function nobodyNote(shift: Shift, label: string): string {
	return shift === "night"
		? `No analyst signed in during ${label}.`
		: `No analyst signed in for afternoon duty during ${label}.`;
}

/** `night-duty` / `afternoon-duty`, the file name stem. */
function fileStem(shift: Shift): string {
	return `${shift}-duty`;
}

export function buildAttendanceExport(input: ExportInput): AttendanceExport {
	const { month, people, entries, scope, generatedAt } = input;
	const shift = input.shift ?? "night";
	const meta = SHIFT_META[shift];
	// Totals stay over the whole roster so the TOTAL row can still say "3 of 11
	// signed in"; only the listed rows are narrowed to the people who worked.
	const roster = summarizeMonth(people, entries);
	const summaries = withNights(roster);
	const totals = totalsOf(roster);
	const label = formatMonth(month);
	const who = scope === "all" ? "All analysts" : personName(people[0] ?? fallbackPerson());
	const title = `${meta.label} Duty Attendance — ${label}`;

	// ---- Summary sheet ----
	const summaryAoa: Cell[][] = [
		[title],
		[`Register: ${who}`],
		[`Generated: ${formatLagosStamp(generatedAt.toISOString())} (Africa/Lagos)`],
		[],
		summaryHeader(shift),
	];
	const summaryHeaderRow = summaryAoa.length;

	for (const s of summaries) {
		summaryAoa.push([
			personName(s.person),
			s.person.email,
			s.nights,
			s.completeNights,
			s.openNights,
			formatDuration(s.totalMinutes),
			formatDuration(s.averageMinutes),
		]);
	}

	if (summaries.length === 0) {
		summaryAoa.push([nobodyNote(shift, label), "", "", "", "", "", ""]);
	}

	summaryAoa.push([
		"TOTAL",
		`${totals.active} of ${totals.people} signed in`,
		totals.nights,
		totals.nights - totals.openNights,
		totals.openNights,
		formatDuration(totals.totalMinutes),
		"",
	]);

	// ---- Nights sheet ----
	const nameById = new Map(people.map((p) => [p.id, personName(p)]));
	const nightsAoa: Cell[][] = [
		[`${title} — every ${meta.noun}`],
		[],
		detailHeader(shift),
	];
	const nightsHeaderRow = nightsAoa.length;

	for (const entry of sortEntries(entries)) {
		nightsAoa.push([
			`${entry.nightDate} (${formatNightLabel(entry.nightDate)})`,
			nameById.get(entry.userId) ?? "Unknown analyst",
			formatLagosStamp(entry.signedInAt),
			formatLagosStamp(entry.signedOutAt),
			formatDuration(entryMinutes(entry)),
			entry.source === "admin" ? "Added by admin" : "Self",
			entry.note ?? "",
		]);
	}

	if (entries.length === 0) {
		nightsAoa.push([`No ${meta.plural.toLowerCase()} recorded in ${label}.`]);
	}

	const fileName =
		scope === "all"
			? `${fileStem(shift)}-${month}-all-analysts.xlsx`
			: `${fileStem(shift)}-${month}-${slug(who)}.xlsx`;

	return {
		title,
		summary: {
			name: "Summary",
			widths: [28, 32, 10, 12, 12, 14, 18],
			headerRow: summaryHeaderRow,
			totalsRow: summaryAoa.length,
			aoa: summaryAoa,
		},
		nights: {
			name: meta.plural,
			widths: [24, 28, 20, 20, 12, 16, 40],
			headerRow: nightsHeaderRow,
			aoa: nightsAoa,
		},
		fileName,
	};
}

function fallbackPerson(): AttendancePerson {
	return { id: "", firstName: "", lastName: "", email: "Unknown analyst" };
}

// ---------------------------------------------------------------------------
// JPEG summary
// ---------------------------------------------------------------------------

export interface ImageColumn {
	label: string;
	/** Share of the table width. Normalised by the painter. */
	weight: number;
	align: "left" | "right";
}

export interface ImageModel {
	title: string;
	subtitle: string;
	footer: string;
	/** Drawn in place of the body when nobody worked a night that month. */
	emptyNote?: string;
	columns: ImageColumn[];
	rows: string[][];
	totals: string[];
	fileName: string;
}

function imageColumns(shift: Shift): ImageColumn[] {
	return [
		{ label: "Analyst", weight: 3, align: "left" },
		{ label: SHIFT_META[shift].plural, weight: 1, align: "right" },
		{ label: "Total hours", weight: 1.4, align: "right" },
	];
}

/**
 * Deliberately just three columns — name, nights worked, total hours. A JPEG
 * is for pasting into a chat as a quick "who did what" glance, not a report;
 * the full breakdown (signed out / still open / per-night average / email)
 * stays in the workbook for whoever needs it.
 *
 * Like the workbook, it lists only analysts with at least one night — the two
 * documents are shared side by side and must not disagree about who is on them.
 */
export function buildSummaryImage(input: ExportInput): ImageModel {
	const { month, people, entries, scope, generatedAt } = input;
	const shift = input.shift ?? "night";
	const meta = SHIFT_META[shift];
	const roster = summarizeMonth(people, entries);
	const summaries = withNights(roster);
	const totals = totalsOf(roster);
	const who =
		scope === "all"
			? `${totals.active} of ${totals.people} analysts signed in`
			: personName(people[0] ?? fallbackPerson());

	return {
		title: `${meta.label} Duty — ${formatMonth(month)}`,
		subtitle: who,
		emptyNote:
			summaries.length === 0 ? nobodyNote(shift, formatMonth(month)) : undefined,
		footer: `Generated ${formatLagosStamp(generatedAt.toISOString())} Africa/Lagos · Audit Toolkit`,
		columns: imageColumns(shift),
		rows: summaries.map((s) => [personName(s.person), String(s.nights), formatDuration(s.totalMinutes)]),
		totals: ["TOTAL", String(totals.nights), formatDuration(totals.totalMinutes)],
		fileName:
			scope === "all"
				? `${fileStem(shift)}-${month}-all-analysts.jpg`
				: `${fileStem(shift)}-${month}-${slug(who)}.jpg`,
	};
}
