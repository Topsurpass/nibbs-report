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
import type { AttendanceEntry, AttendancePerson } from "./types.ts";

/**
 * Pure content model for the night-duty exports.
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
	/** When the file was produced, for the footer. */
	generatedAt: Date;
}

const SUMMARY_HEADER = [
	"Analyst",
	"Email",
	"Nights",
	"Signed out",
	"Still open",
	"Total hours",
	"Average per night",
];

const NIGHTS_HEADER = [
	"Night",
	"Analyst",
	"Signed in",
	"Signed out",
	"Hours",
	"Source",
	"Note",
];

export function buildAttendanceExport(input: ExportInput): AttendanceExport {
	const { month, people, entries, scope, generatedAt } = input;
	// Totals stay over the whole roster so the TOTAL row can still say "3 of 11
	// signed in"; only the listed rows are narrowed to the people who worked.
	const roster = summarizeMonth(people, entries);
	const summaries = withNights(roster);
	const totals = totalsOf(roster);
	const label = formatMonth(month);
	const who = scope === "all" ? "All analysts" : personName(people[0] ?? fallbackPerson());
	const title = `Night Duty Attendance — ${label}`;

	// ---- Summary sheet ----
	const summaryAoa: Cell[][] = [
		[title],
		[`Register: ${who}`],
		[`Generated: ${formatLagosStamp(generatedAt.toISOString())} (Africa/Lagos)`],
		[],
		SUMMARY_HEADER,
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
		summaryAoa.push([`No analyst signed in during ${label}.`, "", "", "", "", "", ""]);
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
		[`${title} — every night`],
		[],
		NIGHTS_HEADER,
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
		nightsAoa.push([`No nights recorded in ${label}.`]);
	}

	const fileName =
		scope === "all"
			? `night-duty-${month}-all-analysts.xlsx`
			: `night-duty-${month}-${slug(who)}.xlsx`;

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
			name: "Nights",
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

const IMAGE_COLUMNS: ImageColumn[] = [
	{ label: "Analyst", weight: 3, align: "left" },
	{ label: "Nights", weight: 1, align: "right" },
	{ label: "Total hours", weight: 1.4, align: "right" },
];

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
	const roster = summarizeMonth(people, entries);
	const summaries = withNights(roster);
	const totals = totalsOf(roster);
	const who =
		scope === "all"
			? `${totals.active} of ${totals.people} analysts signed in`
			: personName(people[0] ?? fallbackPerson());

	return {
		title: `Night Duty — ${formatMonth(month)}`,
		subtitle: who,
		emptyNote:
			summaries.length === 0 ? `No analyst signed in during ${formatMonth(month)}.` : undefined,
		footer: `Generated ${formatLagosStamp(generatedAt.toISOString())} Africa/Lagos · Audit Toolkit`,
		columns: IMAGE_COLUMNS,
		rows: summaries.map((s) => [personName(s.person), String(s.nights), formatDuration(s.totalMinutes)]),
		totals: ["TOTAL", String(totals.nights), formatDuration(totals.totalMinutes)],
		fileName:
			scope === "all"
				? `night-duty-${month}-all-analysts.jpg`
				: `night-duty-${month}-${slug(who)}.jpg`,
	};
}
