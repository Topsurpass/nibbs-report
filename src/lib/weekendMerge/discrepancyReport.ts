// Content model for the workbook sent to the Settlement team when their merged
// file differs from ours. Written for settlement analysts, not developers:
// one row per problem, in plain words, with what their file has and what it
// should be. Pure, so the wording and grouping are testable; the exceljs
// painter in `discrepancyExcel.ts` only decides looks.

import type { ComparisonResult, RowDiff } from "./compare.ts";
import type { MergeResult, MergedRow } from "./merge.ts";

export type CellTone = "bad" | "good" | "warn" | "muted";

export interface ReportCell {
	value: string | number;
	tone?: CellTone;
	bold?: boolean;
	/** Fixed-width font, for file content. */
	mono?: boolean;
}

export type RowStyle = "plain" | "problem" | "ok" | "group";

export interface ReportRow {
	cells: ReportCell[];
	style: RowStyle;
}

export interface ReportTable {
	/** Bold heading above the table, if any. */
	title?: string;
	header: string[];
	rows: ReportRow[];
}

export interface ReportSheet {
	name: string;
	/** Title, then one-line notes. */
	preamble: string[];
	/** Tone of the second preamble line (the verdict). */
	verdictTone?: CellTone;
	widths: number[];
	tables: ReportTable[];
}

export interface DiscrepancyReport {
	fileName: string;
	sheets: ReportSheet[];
}

/** 10-digit settlement code → bank name, when known. */
export type BankNameLookup = (code: string) => string | undefined;

export interface DiscrepancyInput {
	merge: MergeResult;
	comparison: ComparisonResult;
	settlementName: string;
	generatedAt: Date;
	bankName?: BankNameLookup;
}

/** One thing the Settlement team has to fix, in plain words. */
export interface Problem {
	/** "10", "61 and 62", "40 to 320", or "File name" */
	lines: string;
	/** Their line numbers this problem covers (empty for file-level problems). */
	rows: number[];
	session: string;
	bank: string;
	problem: string;
	yours: string;
	shouldBe: string;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function sessionLabel(r: MergedRow): string {
	const d = r.sourceDate;
	return `${DAY[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTH[d.getMonth()]} · ${r.sourceSessionLabel}`;
}

/**
 * "702 [SPACE] 2026/07/02 [TAB] …" so a non-developer can see the separators.
 * The spaces around each marker are only there so Excel can wrap long lines.
 */
export function showSpacing(line: string): string {
	return line
		.split(/(\t| )/)
		.map((part) => (part === "\t" ? "[TAB]" : part === " " ? "[SPACE]" : part))
		.filter((part) => part !== "")
		.join(" ");
}

function fields(line: string | null): string[] {
	if (line === null) return ["", "", "", ""];
	const t = line.trim().split(/\s+/);
	return [0, 1, 2, 3].map((i) => t[i] ?? "");
}

function bankText(code: string, bankName?: BankNameLookup): string {
	if (!code) return "";
	const name = bankName?.(code);
	return name ? `${name} (${code})` : code;
}

const GAPS = ["702 and the date", "the date and the bank code", "the bank code and the amount"];

/** "Space instead of TAB between 702 and the date", in plain words. */
export function spacingProblem(line: string): string {
	if (/^\s/.test(line)) return "Space or TAB before 702 at the start";
	if (/[ \t]$/.test(line)) return "Space or TAB after the amount at the end";
	const seps = line.match(/\s+/g) ?? [];
	const at = seps.findIndex((sep) => sep !== "\t");
	if (at === -1) return "Wrong spacing";
	const gap = GAPS[at] ? ` between ${GAPS[at]}` : "";
	return seps[at].includes(" ") ? `Space instead of TAB${gap}` : `Extra TAB${gap}`;
}

/** Their row r "belongs at row N" → N, else null. */
function orderTarget(diff: RowDiff): number | null {
	if (!diff.kinds.includes("order")) return null;
	const m = diff.reasons.join(" ").match(/row (\d+)/);
	return m ? Number(m[1]) : null;
}

const FIELD_PROBLEM: [kind: "type" | "date" | "code" | "amount", index: number, label: string][] = [
	["type", 0, "Wrong record type"],
	["date", 1, "Wrong date"],
	["code", 2, "Wrong bank code"],
	["amount", 3, "Wrong amount"],
];

/** Turn the line-by-line comparison into the short list of things to fix. */
export function findProblems(input: Pick<DiscrepancyInput, "merge" | "comparison" | "bankName">): Problem[] {
	const { merge, comparison, bankName } = input;
	const problems: Problem[] = [];
	const src = (row: number) => merge.rows[row - 1];
	const where = (row: number) => {
		const s = src(row);
		return {
			session: s ? sessionLabel(s) : "Not in our file",
			bank: bankText(s?.code ?? fields(comparison.rows[row - 1]?.theirs ?? null)[2], bankName),
		};
	};

	if (!comparison.checks.find((c) => c.id === "cmp-filename" && c.status === "pass")) {
		const detail = comparison.checks.find((c) => c.id === "cmp-filename")?.detail ?? "";
		const [, should, got] = detail.match(/Expected "([^"]+)", got "([^"]+)"/) ?? [];
		problems.push({
			lines: "File name",
			rows: [],
			session: "",
			bank: "",
			problem: "Wrong file name",
			yours: got ?? "",
			shouldBe: should ?? merge.fileName,
		});
	}

	const bad = comparison.rows.filter((r) => !r.ok);
	const handled = new Set<number>();
	const total = comparison.rows.length;
	// Content-based, not reason-text-based: real files repeat identical lines,
	// so "belongs at row N" can point at any copy. What matters is whether
	// their line N is our line N±1.
	const ourAt = (row: number) => comparison.rows[row - 1]?.ours ?? null;
	const theirAt = (row: number) => comparison.rows[row - 1]?.theirs ?? null;
	const shifted = (row: number, by: number) => theirAt(row) !== null && theirAt(row) === ourAt(row + by);
	/** Last row of a run where their line r is our line r+by, from `start`. */
	const runEnd = (start: number, by: number) => {
		let r = start;
		while (r + 1 <= total && shifted(r + 1, by)) r++;
		return r;
	};
	/** Mark rows from..to handled (plus a trailing missing/extra line) and return them. */
	const markThrough = (from: number, to: number): number[] => {
		const rows = Array.from({ length: to - from + 1 }, (_, k) => from + k);
		// The end-of-file "missing"/"extra" line is a consequence of the same slip.
		const tail = bad.find((x) => x.row === to + 1 && x.kinds.some((k) => k === "missing" || k === "extra"));
		if (tail) rows.push(tail.row);
		rows.forEach((r) => handled.add(r));
		return rows;
	};

	for (let i = 0; i < bad.length; i++) {
		const d = bad[i];
		if (handled.has(d.row)) continue;

		// Two lines swapped with each other: one problem.
		const partner =
			d.theirs !== null
				? bad
						.filter((x) => x.row !== d.row && !handled.has(x.row) && x.theirs === d.ours && d.theirs === x.ours)
						.sort((x, y) => Math.abs(x.row - d.row) - Math.abs(y.row - d.row))[0]
				: undefined;
		if (partner) {
			handled.add(d.row).add(partner.row);
			const a = Math.min(d.row, partner.row);
			const b = Math.max(d.row, partner.row);
			problems.push({
				lines: `${a} and ${b}`,
				rows: [a, b],
				...where(a),
				bank: where(a).bank === where(b).bank ? where(a).bank : `${where(a).bank}; ${where(b).bank}`,
				problem: "Lines in the wrong order",
				yours: `Line ${a} and line ${b} are swapped`,
				shouldBe: `Swap lines ${a} and ${b}`,
			});
			continue;
		}

		// A line left out: from here on, their line r is our line r+1.
		if (shifted(d.row, 1) && (d.row + 1 > total || shifted(d.row + 1, 1) || ourAt(d.row + 1) === null)) {
			const rows = markThrough(d.row, runEnd(d.row, 1));
			problems.push({
				lines: `${d.row} onwards`,
				rows,
				...where(d.row),
				problem: "A line is missing",
				yours: `Not there (every line after it moved up by one)`,
				shouldBe: `Insert at line ${d.row}: ${showSpacing(ourAt(d.row) ?? "")}`,
			});
			continue;
		}

		// A line added: the lines after this one are our line r-1.
		if (d.theirs !== null && d.row + 1 <= total && shifted(d.row + 1, -1) && (d.row + 2 > total || shifted(d.row + 2, -1))) {
			const rows = markThrough(d.row, runEnd(d.row + 1, -1));
			problems.push({
				lines: String(d.row),
				rows,
				...where(d.row),
				problem: "An extra line",
				yours: showSpacing(d.theirs),
				shouldBe: `Delete line ${d.row} (every line after it moved down by one)`,
			});
			continue;
		}

		const target = orderTarget(d);
		if (target !== null) {
			handled.add(d.row);
			problems.push({
				lines: String(d.row),
				rows: [d.row],
				...where(d.row),
				problem: "Line in the wrong place",
				yours: `This line is at line ${d.row}`,
				shouldBe: `Move it to line ${target}`,
			});
			continue;
		}

		handled.add(d.row);
		if (d.kinds.includes("missing")) {
			problems.push({
				lines: String(d.row),
				rows: [d.row],
				...where(d.row),
				problem: "Line missing",
				yours: "(no line)",
				shouldBe: `Add: ${showSpacing(d.ours ?? "")}`,
			});
			continue;
		}
		if (d.kinds.includes("extra")) {
			problems.push({
				lines: String(d.row),
				rows: [d.row],
				...where(d.row),
				problem: "Extra line",
				yours: showSpacing(d.theirs ?? ""),
				shouldBe: "Delete this line",
			});
			continue;
		}

		// Content problems on one line: one entry per wrong part.
		const ours = fields(d.ours);
		const theirs = fields(d.theirs);
		if (d.kinds.includes("whitespace")) {
			problems.push({
				lines: String(d.row),
				rows: [d.row],
				...where(d.row),
				problem: spacingProblem(d.theirs ?? ""),
				yours: showSpacing(d.theirs ?? ""),
				shouldBe: showSpacing(d.ours ?? ""),
			});
		}
		for (const [kind, idx, label] of FIELD_PROBLEM) {
			if (!d.kinds.includes(kind)) continue;
			problems.push({
				lines: String(d.row),
				rows: [d.row],
				...where(d.row),
				problem: label,
				yours: theirs[idx],
				shouldBe: ours[idx],
			});
		}
	}

	if (comparison.checks.find((c) => c.id === "cmp-trailing-newline" && c.status !== "pass")) {
		problems.push({
			lines: "End of file",
			rows: [],
			session: "",
			bank: "",
			problem: "Empty line at the end",
			yours: "The file ends with an empty line",
			shouldBe: "Remove the empty last line",
		});
	}
	return problems;
}

function stamp(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getDate())} ${MONTH[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function buildDiscrepancyReport(input: DiscrepancyInput): DiscrepancyReport {
	const { merge, comparison, settlementName, generatedAt, bankName } = input;
	const problems = findProblems(input);
	const problemRows = new Set(problems.flatMap((p) => p.rows));
	const n = problems.length;
	const verdict =
		n === 0
			? "No problems found. Your file matches ours."
			: `${n} problem${n === 1 ? "" : "s"} found in your file. Please fix ${n === 1 ? "it" : "them"} and send it again.`;

	// ---- Sheet 1: What to fix ----
	const fixRows: ReportRow[] = problems.map((p, i) => ({
		style: "problem",
		cells: [
			{ value: i + 1 },
			{ value: p.lines, bold: true },
			{ value: p.problem, tone: "bad", bold: true },
			{ value: p.yours, mono: true, tone: "bad" },
			{ value: p.shouldBe, mono: true, tone: "good" },
			{ value: p.bank },
			{ value: p.session },
		],
	}));

	const orderRows: ReportRow[] = merge.sources.map((s, i) => {
		const block = merge.rows.filter((r) => r.sourceName === s.name);
		return {
			style: "plain",
			cells: [
				{ value: i + 1 },
				{ value: block.length ? `${block[0].row} to ${block[block.length - 1].row}` : "" },
				{ value: block[0] ? sessionLabel(block[0]) : "" },
				{ value: s.name, mono: true },
				{ value: "" },
				{ value: "" },
				{ value: "" },
			],
		};
	});

	// ---- Sheet 2: All lines ----
	const allRows: ReportRow[] = [];
	let current = "";
	for (const d of comparison.rows) {
		const s = merge.rows[d.row - 1];
		const label = s ? `${sessionLabel(s)}  ·  ${s.sourceName}` : "Lines only in your file";
		if (label !== current) {
			current = label;
			allRows.push({ style: "group", cells: [{ value: label, bold: true }, ...Array.from({ length: 6 }, () => ({ value: "" }))] });
		}
		const o = fields(d.ours);
		const t = fields(d.theirs);
		const wrongLine = !d.ok;
		const diffAt = (k: number) => wrongLine && (o[k] !== t[k] || d.kinds.some((x) => x === "order" || x === "missing" || x === "extra"));
		allRows.push({
			style: d.ok ? "ok" : "problem",
			cells: [
				{ value: d.row },
				{ value: bankText(s?.code ?? t[2], bankName), tone: diffAt(2) ? "bad" : undefined, bold: diffAt(2) },
				{ value: o[1], mono: true },
				{ value: o[3], mono: true },
				{ value: t[1], mono: true, tone: diffAt(1) ? "bad" : undefined, bold: diffAt(1) },
				{ value: t[3], mono: true, tone: diffAt(3) ? "bad" : undefined, bold: diffAt(3) },
				{
					value: d.ok && !problemRows.has(d.row) ? "OK" : "Fix",
					tone: d.ok ? "good" : "bad",
					bold: !d.ok,
				},
			],
		});
	}

	const base = merge.fileName.replace(/\.txt$/i, "");
	return {
		fileName: `${base}_problems.xlsx`,
		sheets: [
			{
				name: "What to fix",
				preamble: [
					`Weekend settlement file check: ${settlementName}`,
					verdict,
					`Compared with our compilation ${merge.fileName} on ${stamp(generatedAt)}. Line numbers are the lines in your file.`,
				],
				verdictTone: n === 0 ? "good" : "bad",
				widths: [4, 12, 26, 36, 36, 30, 18],
				tables: [
					{
						header: ["#", "Line", "Problem", "In your file", "Should be", "Bank", "Session"],
						rows: fixRows,
					},
					{
						title: "Correct order of the session files (by date, then 8am, 11am, 2pm, 5pm)",
						header: ["#", "Lines", "Session", "File", "", "", ""],
						rows: orderRows,
					},
				],
			},
			{
				name: "All lines",
				preamble: [
					"Every line: ours next to yours",
					"Red cells are where your file differs from ours. Grey bars show where each session file starts.",
				],
				widths: [7, 36, 13, 24, 13, 24, 8],
				tables: [
					{
						header: ["Line", "Bank", "Our date", "Our amount", "Your date", "Your amount", "Status"],
						rows: allRows,
					},
				],
			},
		],
	};
}
