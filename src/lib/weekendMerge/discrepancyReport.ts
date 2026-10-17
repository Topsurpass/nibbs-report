// Content model for the discrepancy workbook sent to the Settlement team.
//
// Pure, so what the report says is testable; `discrepancyExcel.ts` only paints
// it. The workbook puts our compilation and Settlement's side by side, row by
// row, in merge order (which session file and line each row came from), and
// marks every cell that differs so Settlement can find and fix it themselves.

import { toSlashDate } from "../format.ts";
import type { CheckResult } from "../reconcile.ts";
import { MISMATCH_LABELS, type ComparisonResult, type MismatchKind, type RowDiff } from "./compare.ts";
import type { MergeResult, MergedRow } from "./merge.ts";
import { weekdayName } from "./sourceFile.ts";
import { visibleWhitespace } from "./text.ts";

export type CellTone = "bad" | "good" | "warn" | "muted";

export interface ReportCell {
	value: string | number;
	tone?: CellTone;
	bold?: boolean;
	/** Fixed-width font, for record fields. */
	mono?: boolean;
}

export type RowStyle = "plain" | "mismatch" | "match" | "group" | "total";

export interface ReportRow {
	cells: ReportCell[];
	style: RowStyle;
}

export interface ReportSheet {
	name: string;
	/** Lines above the table: first is the title. */
	preamble: string[];
	header: string[];
	/** Optional banner above the header, spanning column groups: [label, firstCol, lastCol] (1-based). */
	headerGroups?: [string, number, number][];
	widths: number[];
	rows: ReportRow[];
}

export interface DiscrepancyReport {
	fileName: string;
	sheets: ReportSheet[];
}

export interface DiscrepancyInput {
	merge: MergeResult;
	comparison: ComparisonResult;
	settlementName: string;
	generatedAt: Date;
}

const FIELD_KIND: MismatchKind[] = ["type", "date", "code", "amount"];

function longDate(d: Date): string {
	return `${weekdayName(d)} ${toSlashDate(d)}`;
}

function sessionText(r: MergedRow): string {
	return `${longDate(r.sourceDate)} · ${r.sourceSessionLabel} (_${r.sourceSession})`;
}

function stamp(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Our four fields: our lines are always exactly tab-separated. */
function ourFields(line: string | null): string[] {
	return line === null ? ["", "", "", ""] : line.split("\t");
}

/** Settlement's fields as best we can read them, whatever separated them. */
function theirFields(line: string | null): string[] {
	if (line === null) return ["", "", "", ""];
	const tokens = line.trim().split(/\s+/);
	return [0, 1, 2, 3].map((i) => tokens[i] ?? "");
}

/** Which of Settlement's four fields to mark as wrong on this row. */
export function badFields(diff: RowDiff): boolean[] {
	if (diff.ok) return [false, false, false, false];
	// A row out of place, missing or extra is wrong as a whole row.
	if (diff.kinds.some((k) => k === "order" || k === "missing" || k === "extra")) return [true, true, true, true];
	return FIELD_KIND.map((k) => diff.kinds.includes(k));
}

function resultLabel(diff: RowDiff): string {
	return diff.ok ? "Match" : diff.kinds.map((k) => MISMATCH_LABELS[k]).join(" + ");
}

/** "What to do" in plain words, pointing at Settlement's own line number. */
export function fixHint(diff: RowDiff): string {
	if (diff.ok) return "";
	if (diff.kinds.includes("missing")) return `Add this row as line ${diff.row} of your file.`;
	if (diff.kinds.includes("extra")) return `Remove line ${diff.row} from your file; we have no such row.`;
	if (diff.kinds.includes("order")) {
		const target = diff.reasons.join(" ").match(/row (\d+)/)?.[1];
		return target
			? `Line ${diff.row} is in the wrong place; it belongs at line ${target}. Check the session order.`
			: `Line ${diff.row} is in the wrong place. Check the session order.`;
	}
	return `Correct line ${diff.row}: ${diff.reasons.join("; ")}.`;
}

function sideBySideRow(diff: RowDiff, src: MergedRow | undefined): ReportRow {
	const ours = ourFields(diff.ours);
	const theirs = theirFields(diff.theirs);
	const bad = badFields(diff);
	const spacingBad = diff.kinds.includes("whitespace");
	return {
		style: diff.ok ? "match" : "mismatch",
		cells: [
			{ value: diff.row, mono: true },
			{ value: resultLabel(diff), tone: diff.ok ? "good" : "bad", bold: !diff.ok },
			{ value: src ? sessionText(src) : "—", tone: src ? undefined : "muted" },
			{ value: src ? `${src.sourceName} line ${src.sourceLine}` : "Not in our compilation", tone: src ? "muted" : "bad" },
			...ours.map((v): ReportCell => ({ value: v, mono: true })),
			...theirs.map((v, i): ReportCell => ({ value: v, mono: true, tone: bad[i] ? "bad" : undefined, bold: bad[i] })),
			{
				value: diff.theirs === null ? "(no line)" : visibleWhitespace(diff.theirs),
				mono: true,
				tone: spacingBad ? "bad" : "muted",
				bold: spacingBad,
			},
			{ value: diff.ok ? "" : diff.reasons.join("; ") },
			{ value: fixHint(diff) },
		],
	};
}

function groupRow(src: MergedRow, firstRow: number, lastRow: number, width: number): ReportRow {
	const text = `${sessionText(src)} · ${src.sourceName} · our lines ${firstRow}–${lastRow}`;
	return { style: "group", cells: [{ value: text, bold: true }, ...Array.from({ length: width - 1 }, () => ({ value: "" }))] };
}

const SIDE_HEADER = [
	"Line",
	"Result",
	"Session (merge order)",
	"Source file & line",
	"Record type",
	"Date",
	"Bank code",
	"Amount",
	"Record type",
	"Date",
	"Bank code",
	"Amount",
	"Settlement line as sent (⇥ tab · space)",
	"What's different",
	"How to fix",
];
const SIDE_WIDTHS = [7, 18, 30, 34, 11, 12, 14, 24, 11, 12, 14, 24, 60, 50, 50];
const SIDE_GROUPS: [string, number, number][] = [
	["Where the row came from", 3, 4],
	["Our compilation", 5, 8],
	["Settlement's file", 9, 13],
];

/** Row-by-row sheet, broken into session blocks so merge order reads top to bottom. */
function sideBySide(input: DiscrepancyInput, onlyDifferences: boolean): ReportRow[] {
	const { merge, comparison } = input;
	const rows: ReportRow[] = [];
	let currentSource: string | null = null;
	for (const diff of comparison.rows) {
		if (onlyDifferences && diff.ok) continue;
		const src = merge.rows[diff.row - 1];
		if (!onlyDifferences && src && src.sourceName !== currentSource) {
			currentSource = src.sourceName;
			const block = merge.rows.filter((r) => r.sourceName === src.sourceName);
			rows.push(groupRow(src, block[0].row, block[block.length - 1].row, SIDE_HEADER.length));
		}
		if (!onlyDifferences && !src && currentSource !== "__extra__") {
			currentSource = "__extra__";
			rows.push({
				style: "group",
				cells: [
					{ value: "Lines only in Settlement's file (not in our compilation)", bold: true },
					...Array.from({ length: SIDE_HEADER.length - 1 }, () => ({ value: "" })),
				],
			});
		}
		rows.push(sideBySideRow(diff, src));
	}
	return rows;
}

function checkRows(checks: CheckResult[]): ReportRow[] {
	return checks.map((c) => ({
		style: "plain" as const,
		cells: [
			{ value: c.label },
			{
				value: c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : "CHECK",
				tone: c.status === "pass" ? ("good" as const) : c.status === "fail" ? ("bad" as const) : ("warn" as const),
				bold: true,
			},
			{ value: c.detail },
		],
	}));
}

export function buildDiscrepancyReport(input: DiscrepancyInput): DiscrepancyReport {
	const { merge, comparison, settlementName, generatedAt } = input;
	const differing = comparison.rows.filter((r) => !r.ok);
	const verdict = comparison.pass
		? "MATCH: Settlement's file agrees with our compilation."
		: `MISMATCH: ${comparison.mismatched} of ${comparison.rows.length} lines differ.`;

	// ---- Summary ----
	const kinds = Object.keys(comparison.byKind) as MismatchKind[];
	const summaryRows: ReportRow[] = [
		{ style: "plain", cells: [{ value: "Our compilation" }, { value: merge.fileName, mono: true }, { value: `${merge.rows.length} lines` }] },
		{ style: "plain", cells: [{ value: "Settlement's file" }, { value: settlementName, mono: true }, { value: `${comparison.rows.length - comparison.rows.filter((r) => r.theirs === null).length} lines` }] },
		{
			style: "total",
			cells: [
				{ value: "Result" },
				{ value: comparison.pass ? "MATCH" : "MISMATCH", tone: comparison.pass ? "good" : "bad", bold: true },
				{ value: verdict },
			],
		},
		...kinds.map((k) => ({
			style: "plain" as const,
			cells: [{ value: `  ${MISMATCH_LABELS[k]}` }, { value: comparison.byKind[k] ?? 0, tone: "bad" as const, bold: true }, { value: "line(s)" }],
		})),
		{ style: "group", cells: [{ value: "File checks", bold: true }, { value: "" }, { value: "" }] },
		...checkRows(comparison.checks),
		{ style: "group", cells: [{ value: "How to read this workbook", bold: true }, { value: "" }, { value: "" }] },
		{ style: "plain", cells: [{ value: "Side by side" }, { value: "Every line, ours next to yours, grouped by session in merge order." }, { value: "" }] },
		{ style: "plain", cells: [{ value: "Differences" }, { value: "Only the lines that differ, with what to fix." }, { value: "" }] },
		{ style: "plain", cells: [{ value: "Merge order" }, { value: "The order the session files are compiled in." }, { value: "" }] },
		{ style: "plain", cells: [{ value: "Red cells" }, { value: "The exact field in your file that differs from ours.", tone: "bad" }, { value: "" }] },
		{ style: "plain", cells: [{ value: "Line numbers" }, { value: "Line N is the Nth line of your file and of ours." }, { value: "" }] },
	];

	// ---- Merge order ----
	const orderRows: ReportRow[] = merge.sources.map((s, i) => {
		const block = merge.rows.filter((r) => r.sourceName === s.name);
		const lines = block.map((r) => r.row);
		const bad = differing.filter((d) => lines.includes(d.row)).length;
		return {
			style: bad > 0 ? ("mismatch" as const) : ("plain" as const),
			cells: [
				{ value: i + 1 },
				{ value: s.name, mono: true },
				{ value: s.date ? longDate(s.date) : "—" },
				{ value: `${s.sessionLabel ?? "—"} (_${s.session ?? "?"})` },
				{ value: block.length },
				{ value: lines.length ? `${lines[0]}–${lines[lines.length - 1]}` : "—", mono: true },
				{ value: bad, tone: bad > 0 ? "bad" : "good", bold: bad > 0 },
			],
		};
	});

	const base = merge.fileName.replace(/\.txt$/i, "");
	return {
		fileName: `${base}_discrepancies.xlsx`,
		sheets: [
			{
				name: "Summary",
				preamble: [
					`Weekend settlement comparison: ${merge.fileName}`,
					verdict,
					`Generated ${stamp(generatedAt)} (Africa/Lagos) · Audit Toolkit`,
				],
				header: ["Item", "Value", "Detail"],
				widths: [26, 44, 90],
				rows: summaryRows,
			},
			{
				name: "Differences",
				preamble: [
					`Lines that differ (${differing.length})`,
					differing.length === 0
						? "No differences: every line matches."
						: "Red cells are the fields in Settlement's file that differ from our compilation.",
				],
				header: SIDE_HEADER,
				headerGroups: SIDE_GROUPS,
				widths: SIDE_WIDTHS,
				rows: sideBySide(input, true),
			},
			{
				name: "Side by side",
				preamble: [
					"Every line, ours next to Settlement's, in merge order",
					"Grey bars mark where each session file starts.",
				],
				header: SIDE_HEADER,
				headerGroups: SIDE_GROUPS,
				widths: SIDE_WIDTHS,
				rows: sideBySide(input, false),
			},
			{
				name: "Merge order",
				preamble: [
					"Order of compilation",
					"Sessions are compiled by date, then 8am → 11am → 2pm → 5pm. Every line takes the merge date.",
				],
				header: ["#", "Session file", "Day", "Session", "Lines", "Our lines", "Lines that differ"],
				widths: [5, 32, 22, 16, 8, 12, 16],
				rows: orderRows,
			},
		],
	};
}

