// The "What to fix" review for a Settlement Audit: turns an eTranzact file
// checked against the Frame report into a short list of plain-words fixes the
// Settlement team can act on (line, bank, what the file has, what it should
// be). Pure, so every rule is testable; the workbook look lives in
// `reviewWorkbook/paint.ts`.
//
// The Frame HTML is the reference: where the two disagree, the .txt is wrong.
// Collateral breaches are not included; they are escalation, not a mistake in
// Settlement's files.
//
// Lines are read tolerantly (any whitespace between fields), so one slip is
// one problem: a space where a TAB belongs is a spacing fix, not also a
// "bank missing" and a "bank not in the Frame report".

import { formatNaira, parseSlashDate, sameDay, toCents, toDdmmyyyy, toSlashDate } from "../format.ts";
import type { FrameParseResult } from "../parseHtml.ts";
import type { MasterBank } from "../master.ts";
import { LEGACY_BANK_CODE_MERGES } from "../legacyBankCodes.ts";
import { SESSION_LABELS, sessionFromHtmlName } from "../session/nibbsSession.ts";
import type { DiscrepancyReport, ReportCell, ReportRow } from "../reviewWorkbook/model.ts";
import { showSpacing, spacingProblem } from "../reviewWorkbook/spacing.ts";

export type AuditProblemKind =
	| "file-name"
	| "frame-balance"
	| "blank-line"
	| "format"
	| "date"
	| "amount"
	| "wrong-code"
	| "unknown-code"
	| "extra-bank"
	| "duplicate-bank"
	| "missing-bank";

/** One thing the Settlement team has to fix, in plain words. */
export interface AuditProblem {
	kind: AuditProblemKind;
	/** "Line 7", "Lines 4 and 9", "File name", "Frame report", "Not in your file". */
	where: string;
	/** Line numbers in their .txt this covers (empty for file-level problems). */
	lines: number[];
	bank: string;
	problem: string;
	yours: string;
	shouldBe: string;
}

export interface AuditReviewInput {
	/** The eTranzact .txt exactly as uploaded. */
	txtText: string;
	txtName: string;
	frame: FrameParseResult;
	htmlName?: string;
	master: MasterBank[];
	reportDate: Date;
}

/** One line of their file, read with any whitespace between fields. */
interface TxtLine {
	line: number;
	raw: string;
	type: string;
	date: string;
	code: string;
	amountStr: string;
	/** NaN when the amount can't be read. */
	amount: number;
}

const LINE_RE = /^702\t\d{4}\/\d{2}\/\d{2}\t\d{10}\t[+-]\d{17}\.\d{2}$/;
const AMOUNT_RE = /^[+-]\d{17}\.\d{2}$/;

/** An amount as eTranzact writes it: sign, 17 zero-padded digits, 2 decimals. */
export function formatEtranzactAmount(n: number): string {
	const cents = toCents(n);
	const abs = Math.abs(cents);
	const whole = String(Math.floor(abs / 100)).padStart(17, "0");
	return `${cents < 0 ? "-" : "+"}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

function etranzactLine(date: string, code: string, amount: number): string {
	return ["702", date, code, formatEtranzactAmount(amount)].join("\t");
}

function readLines(text: string): TxtLine[] {
	const raw = text.split("\n").map((l) => l.replace(/\r$/, ""));
	// A single final line break is allowed, as the format gate allows it.
	if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
	return raw.map((r, i) => {
		const [type = "", date = "", code = "", amountStr = ""] = r.trim().split(/\s+/);
		const amount = /^[+-]?\d+(\.\d+)?$/.test(amountStr) ? parseFloat(amountStr) : NaN;
		return { line: i + 1, raw: r, type, date, code, amountStr, amount };
	});
}

/** The 10-digit code inside a malformed one, e.g. "###4000015030" → "4000015030". */
function tenDigits(code: string): string | null {
	const m = code.match(/\d{10}$/);
	return m ? m[0] : null;
}

/** The session number Settlement's file must carry: the Frame letter wins. */
function expectedName(txtName: string, htmlName: string | undefined, reportDate: Date): string {
	const fromHtml = htmlName ? sessionFromHtmlName(htmlName) : undefined;
	const seq = fromHtml
		? String(SESSION_LABELS.indexOf(fromHtml) + 1)
		: (txtName.match(/_(\d)(?:\D[^_]*)?\.txt$/i)?.[1] ?? "1");
	return `ETRANZACT_${toDdmmyyyy(reportDate)}_${seq}.txt`;
}

function fileNameProblem(input: AuditReviewInput): AuditProblem | null {
	const should = expectedName(input.txtName, input.htmlName, input.reportDate);
	if (input.txtName === should) return null;
	const m = input.txtName.match(/^ETRANZACT_(\d{8})_(\d)\.txt$/);
	const s = should.match(/^ETRANZACT_(\d{8})_(\d)\.txt$/)!;
	const what = !m
		? "File name is not ETRANZACT_<ddmmyyyy>_<n>.txt"
		: m[1] !== s[1] && m[2] !== s[2]
			? "Wrong date and session in the file name"
			: m[1] !== s[1]
				? "Wrong date in the file name"
				: "Wrong session number in the file name";
	const why = m && m[2] !== s[2] && input.htmlName ? ` (the Frame report ${input.htmlName} is _${s[2]})` : "";
	return {
		kind: "file-name",
		where: "File name",
		lines: [],
		bank: "",
		problem: `${what}${why}`,
		yours: input.txtName,
		shouldBe: should,
	};
}

/** What's wrong with a line's layout, if anything, in plain words. */
function formatProblem(l: TxtLine, reportSlash: string): AuditProblem | null {
	if (LINE_RE.test(l.raw)) return null;
	const fields = l.raw.trim().split(/\s+/);
	const spacingBad = l.raw.split("\t").length !== 4 || /[ \r]/.test(l.raw) || l.raw.split("\t").some((f) => f === "");
	const parts: string[] = [];
	if (spacingBad) parts.push(spacingProblem(l.raw));
	if (fields.length > 4) parts.push(`${fields.length - 4} extra value(s) after the amount`);
	if (l.type !== "702") parts.push(`Record type must be 702, not "${l.type}"`);
	const dateOk = /^\d{4}\/\d{2}\/\d{2}$/.test(l.date) && parseSlashDate(l.date) !== null;
	if (!dateOk) parts.push(`Date must be YYYY/MM/DD, not "${l.date}"`);
	const codeOk = /^\d{10}$/.test(l.code);
	if (!codeOk) parts.push(`Bank code must be exactly 10 digits, not "${l.code}"`);
	if (!AMOUNT_RE.test(l.amountStr)) parts.push("Amount must be + or -, 17 digits, a dot and 2 decimals");
	if (parts.length === 0) return null;

	const code = codeOk ? l.code : tenDigits(l.code);
	const rebuilt =
		code && Number.isFinite(l.amount)
			? etranzactLine(dateOk ? l.date : reportSlash, code, l.amount)
			: null;
	return {
		kind: "format",
		where: `Line ${l.line}`,
		lines: [l.line],
		bank: "",
		problem: parts.join("; "),
		yours: showSpacing(l.raw),
		shouldBe: rebuilt ? showSpacing(rebuilt) : `702 [TAB] ${reportSlash} [TAB] <10-digit code> [TAB] <amount>`,
	};
}

export function findAuditProblems(input: AuditReviewInput): AuditProblem[] {
	const { frame, master, reportDate } = input;
	const reportSlash = toSlashDate(reportDate);
	const masterName = new Map(master.map((m) => [m.code, m.name]));
	const frameName = new Map(frame.rows.map((r) => [r.code, r.name]));
	const bank = (code: string) => {
		const name = masterName.get(code) ?? frameName.get(code);
		return name ? `${name} (${code})` : code;
	};

	const problems: AuditProblem[] = [];
	const nameProblem = fileNameProblem(input);
	if (nameProblem) problems.push(nameProblem);

	if (frame.rows.length > 0 && toCents(frame.netSum) !== 0) {
		problems.push({
			kind: "frame-balance",
			where: "Frame report",
			lines: [],
			bank: "",
			problem: "The Frame report does not balance",
			yours: `Net settlement positions add up to ${formatNaira(frame.netSum)}`,
			shouldBe: "0.00. Re-export the Frame report",
		});
	}

	const lines = readLines(input.txtText);

	// --- Layout and date, line by line -----------------------------------
	const records: TxtLine[] = [];
	const wrongDates: TxtLine[] = [];
	for (const l of lines) {
		if (l.raw.trim() === "") {
			problems.push({
				kind: "blank-line",
				where: `Line ${l.line}`,
				lines: [l.line],
				bank: "",
				problem: "Empty line",
				yours: "(empty)",
				shouldBe: "Delete this line",
			});
			continue;
		}
		const fmt = formatProblem(l, reportSlash);
		if (fmt) problems.push(fmt);
		const code = /^\d{10}$/.test(l.code) ? l.code : tenDigits(l.code);
		if (code && Number.isFinite(l.amount)) records.push({ ...l, code });
		const date = parseSlashDate(l.date);
		if (date && /^\d{4}\/\d{2}\/\d{2}$/.test(l.date) && !sameDay(date, reportDate)) wrongDates.push(l);
	}
	const dated = lines.filter((l) => l.raw.trim() !== "").length;
	if (wrongDates.length > 1 && wrongDates.length === dated) {
		const seen = [...new Set(wrongDates.map((l) => l.date))].join(", ");
		problems.push({
			kind: "date",
			where: `Lines 1 to ${lines.length}`,
			lines: wrongDates.map((l) => l.line),
			bank: "",
			problem: "Every line has the wrong date",
			yours: seen,
			shouldBe: reportSlash,
		});
	} else {
		for (const l of wrongDates) {
			problems.push({
				kind: "date",
				where: `Line ${l.line}`,
				lines: [l.line],
				bank: bank(l.code),
				problem: "Wrong date",
				yours: l.date,
				shouldBe: reportSlash,
			});
		}
	}

	// --- Banks against the Frame report ----------------------------------
	// A legacy code's Frame amount is part of its current bank's (see
	// legacyBankCodes.ts), so the file is checked against the combined figure.
	const expected = new Map<string, number>();
	for (const r of frame.rows) {
		const code = LEGACY_BANK_CODE_MERGES[r.code] ?? r.code;
		expected.set(code, (expected.get(code) ?? 0) + r.netPosition);
	}
	const byCode = new Map<string, TxtLine[]>();
	for (const r of records) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);

	for (const [code, rs] of byCode) {
		if (rs.length < 2) continue;
		problems.push({
			kind: "duplicate-bank",
			where: `Lines ${rs.map((r) => r.line).join(" and ")}`,
			lines: rs.map((r) => r.line),
			bank: bank(code),
			problem: "The same bank appears more than once",
			yours: rs.map((r) => `Line ${r.line}: ${r.amountStr}`).join("; "),
			shouldBe: expected.has(code)
				? `One line: ${formatEtranzactAmount(expected.get(code)!)}`
				: "One line per bank",
		});
	}

	const missing = new Map(
		[...expected].filter(([code, amount]) => !byCode.has(code) && toCents(amount) !== 0),
	);
	for (const [code, rs] of byCode) {
		const r = rs[0];
		if (rs.length > 1) continue;
		const want = expected.get(code);
		if (want === undefined) {
			// A code the Frame doesn't have: if a missing Frame bank has exactly
			// this amount, the code was mistyped.
			const match = [...missing].find(([, amount]) => toCents(amount) === toCents(r.amount));
			if (match) {
				missing.delete(match[0]);
				problems.push({
					kind: "wrong-code",
					where: `Line ${r.line}`,
					lines: [r.line],
					bank: bank(match[0]),
					problem: "Wrong bank code",
					yours: r.code,
					shouldBe: match[0],
				});
			} else if (!masterName.has(code)) {
				problems.push({
					kind: "unknown-code",
					where: `Line ${r.line}`,
					lines: [r.line],
					bank: code,
					problem: "Bank code is not on the NIBBS bank list or in the Frame report",
					yours: r.code,
					shouldBe: "Check the bank code",
				});
			} else {
				problems.push({
					kind: "extra-bank",
					where: `Line ${r.line}`,
					lines: [r.line],
					bank: bank(code),
					problem: "Bank is not in the Frame report",
					yours: r.amountStr,
					shouldBe: "Remove this line, or check the Frame report",
				});
			}
			continue;
		}
		if (toCents(want) !== toCents(r.amount)) {
			problems.push({
				kind: "amount",
				where: `Line ${r.line}`,
				lines: [r.line],
				bank: bank(code),
				problem: `Amount does not match the Frame report (off by ${formatNaira(r.amount - want)})`,
				yours: r.amountStr,
				shouldBe: formatEtranzactAmount(want),
			});
		}
	}
	for (const [code, amount] of missing) {
		problems.push({
			kind: "missing-bank",
			where: "Not in your file",
			lines: [],
			bank: bank(code),
			problem: "Bank is in the Frame report but missing from your file",
			yours: "(no line)",
			shouldBe: `Add: ${showSpacing(etranzactLine(reportSlash, code, amount))}`,
		});
	}

	// File-level first, then by line, then banks to add.
	const rank = (p: AuditProblem) => (p.kind === "missing-bank" ? 2 : p.lines.length === 0 ? 0 : 1);
	return problems.sort((a, b) => rank(a) - rank(b) || (a.lines[0] ?? 0) - (b.lines[0] ?? 0));
}

// ---- Workbook ------------------------------------------------------------

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GAP: ReportCell = { value: "" };
const GAP_WIDTH = 3;
const BANKS_HEADER = ["Bank", "Code", "Frame amount", "", "Line", "Your amount", "Difference", "Status"];

function stamp(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getDate())} ${MONTH[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "ETRANZACT_22072026_2_review.xlsx": their file's name, or the right one if theirs is broken. */
export function reviewFileName(input: Pick<AuditReviewInput, "txtName" | "htmlName" | "reportDate">): string {
	const base = /^ETRANZACT_\d{8}_\d\.txt$/i.test(input.txtName)
		? input.txtName
		: expectedName(input.txtName, input.htmlName, input.reportDate);
	return base.replace(/\.txt$/i, "_review.xlsx");
}

export function buildAuditReview(
	input: AuditReviewInput,
	generatedAt: Date,
	problems: AuditProblem[] = findAuditProblems(input),
): DiscrepancyReport {
	const n = problems.length;
	const verdict =
		n === 0
			? "No problems found. Your file matches the Frame report."
			: `${n} problem${n === 1 ? "" : "s"} found. Please fix ${n === 1 ? "it" : "them"} and send the file again.`;

	const fixRows: ReportRow[] = problems.map((p, i) => ({
		style: "problem",
		cells: [
			{ value: i + 1 },
			{ value: p.where, bold: true },
			{ value: p.problem, tone: "bad", bold: true },
			{ value: p.yours, mono: true, tone: "bad" },
			GAP,
			{ value: p.shouldBe, mono: true, tone: "good" },
			{ value: p.bank },
		],
	}));

	// Every bank, Frame next to theirs.
	const masterName = new Map(input.master.map((m) => [m.code, m.name]));
	const expected = new Map<string, { amount: number; name: string }>();
	for (const r of input.frame.rows) {
		const code = LEGACY_BANK_CODE_MERGES[r.code] ?? r.code;
		const prev = expected.get(code);
		expected.set(code, { amount: (prev?.amount ?? 0) + r.netPosition, name: prev?.name ?? r.name });
	}
	const theirs = new Map<string, TxtLine>();
	for (const l of readLines(input.txtText)) {
		const code = /^\d{10}$/.test(l.code) ? l.code : tenDigits(l.code);
		if (code && Number.isFinite(l.amount) && !theirs.has(code)) theirs.set(code, { ...l, code });
	}
	const codes = [...new Set([...expected.keys(), ...theirs.keys()])].sort((a, b) => {
		const la = theirs.get(a)?.line ?? Infinity;
		const lb = theirs.get(b)?.line ?? Infinity;
		return la - lb || a.localeCompare(b);
	});
	const bankRows: ReportRow[] = codes.map((code) => {
		const f = expected.get(code);
		const t = theirs.get(code);
		const name = masterName.get(code) ?? f?.name ?? code;
		const diff = f && t ? t.amount - f.amount : null;
		const status = !t ? "Missing" : !f ? "Extra" : toCents(diff ?? 0) === 0 ? "OK" : "Fix";
		const bad = status !== "OK";
		return {
			style: bad ? "problem" : "ok",
			cells: [
				{ value: name },
				{ value: code, mono: true },
				{ value: f ? formatNaira(f.amount) : "", mono: true },
				GAP,
				{ value: t ? t.line : "" },
				{ value: t ? formatNaira(t.amount) : "", mono: true, tone: bad ? "bad" : undefined, bold: bad },
				{ value: diff === null ? "" : formatNaira(diff), mono: true, tone: bad && diff !== null ? "bad" : undefined },
				{ value: status, tone: bad ? "bad" : "good", bold: bad },
			],
		};
	});

	return {
		fileName: reviewFileName(input),
		sheets: [
			{
				name: "What to fix",
				preamble: [
					`Settlement file check: ${input.txtName}`,
					verdict,
					`Checked against the Frame report${input.htmlName ? ` ${input.htmlName}` : ""} and the NIBBS bank list on ${stamp(generatedAt)}. Line numbers are the lines in your file.`,
				],
				verdictTone: n === 0 ? "good" : "bad",
				widths: [4, 16, 40, 36, GAP_WIDTH, 36, 34],
				tables: [
					{
						bands: [
							{ label: "YOUR eTRANZACT FILE", from: 3, to: 3, side: "theirs" },
							{ label: "SHOULD BE (FRAME REPORT)", from: 5, to: 5, side: "ours" },
						],
						header: ["#", "Where", "Problem", "In your file", "", "Should be", "Bank"],
						gaps: [4],
						rows: fixRows,
					},
				],
			},
			{
				name: "All banks",
				preamble: [
					"Every bank: Frame report next to your file",
					"Frame report on the left, your file on the right. Red rows need fixing.",
				],
				widths: [34, 13, 24, GAP_WIDTH, 7, 24, 20, 9],
				tables: [
					{
						bands: [
							{ label: "FRAME REPORT (HTML)", from: 2, to: 2, side: "ours" },
							{ label: "YOUR eTRANZACT FILE", from: 4, to: 6, side: "theirs" },
						],
						header: BANKS_HEADER,
						gaps: [3],
						rows: bankRows,
					},
				],
			},
		],
	};
}
