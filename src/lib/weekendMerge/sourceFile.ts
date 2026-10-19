// Inspect one uploaded weekend/holiday session file (ETRANZACT_<ddmmyyyy>_<n>.txt).
// Every check runs at upload time so a bad file is flagged before it can reach
// the merge.

import { validateTxtFormat, type TxtFormatIssue } from "../parseTxt.ts";
import { parseDdmmyyyy, toDdmmyyyy, toSlashDate } from "../format.ts";
import { SESSION_BY_SEQ, type SessionLabel } from "../session/nibbsSession.ts";
import { amountToKobo, formatKobo, splitLinesExact, ZERO } from "./text.ts";

export type SessionNo = 1 | 2 | 3 | 4;

export interface SourceRecord {
  /** 1-based line number in the source file. */
  line: number;
  typeCode: string;
  dateStr: string;
  code: string;
  /** Amount exactly as written, e.g. "+00000001489944920.60". */
  amountStr: string;
  kobo: bigint;
}

export interface SourceIssue {
  severity: "fail" | "warn";
  message: string;
}

export interface SourceFile {
  /** Stable id for UI keys (name + upload counter). */
  id: string;
  name: string;
  /** Business date from the filename, or null when the name is invalid. */
  date: Date | null;
  dateSegment?: string;
  session?: SessionNo;
  sessionLabel?: SessionLabel;
  records: SourceRecord[];
  sumKobo: bigint;
  lineEndings: "crlf" | "lf" | "mixed" | "none";
  formatIssues: TxtFormatIssue[];
  issues: SourceIssue[];
  /** True when no issue has severity "fail" — the file may be merged. */
  valid: boolean;
}

export const SOURCE_NAME_RE = /^ETRANZACT_(\d{8})_(\d+)\.txt$/;
const RECORD_RE = /^(702)\t(\d{4}\/\d{2}\/\d{2})\t(\d{10})\t([+-]\d{17}\.\d{2})$/;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(d: Date): string {
  return WEEKDAY_NAMES[d.getDay()];
}

export function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

export function inspectSourceFile(name: string, text: string, id: string = name): SourceFile {
  const issues: SourceIssue[] = [];

  // --- filename: exact case, exact shape, session 1..4 ------------------
  let date: Date | null = null;
  let dateSegment: string | undefined;
  let session: SessionNo | undefined;
  const m = name.match(SOURCE_NAME_RE);
  if (!m) {
    issues.push({
      severity: "fail",
      message: `Filename must be exactly ETRANZACT_<ddmmyyyy>_<1-4>.txt (got "${name}")`,
    });
  } else {
    dateSegment = m[1];
    date = parseDdmmyyyy(dateSegment);
    // parseDdmmyyyy range-checks loosely; reject rollovers like 31/02.
    if (date && toDdmmyyyy(date) !== dateSegment) date = null;
    if (!date) issues.push({ severity: "fail", message: `"${dateSegment}" is not a valid ddmmyyyy date` });
    const seq = Number(m[2]);
    if (m[2].length === 1 && seq >= 1 && seq <= 4) session = seq as SessionNo;
    else issues.push({ severity: "fail", message: `Session must be 1-4 (8am, 11am, 2pm, 5pm), got "_${m[2]}"` });
  }

  // --- content: strict template, line endings ---------------------------
  const format = validateTxtFormat(text);
  if (!format.valid) {
    issues.push({
      severity: "fail",
      message: `${format.issues.length} line(s) break the record template (first: line ${format.issues[0].line}, ${format.issues[0].message})`,
    });
  }

  const split = splitLinesExact(text);
  if (split.lineEndings === "mixed") {
    issues.push({ severity: "fail", message: "Mixed line endings (some CRLF, some LF)" });
  } else if (split.lineEndings === "lf") {
    issues.push({ severity: "warn", message: "LF line endings; the merged file will use CRLF" });
  }

  const records: SourceRecord[] = [];
  split.lines.forEach((l, i) => {
    const r = l.content.match(RECORD_RE);
    if (!r) return;
    const kobo = amountToKobo(r[4]);
    if (kobo === null) return;
    records.push({ line: i + 1, typeCode: r[1], dateStr: r[2], code: r[3], amountStr: r[4], kobo });
  });
  if (records.length === 0) issues.push({ severity: "fail", message: "No valid records in the file" });

  // --- in-row dates must equal the filename date ------------------------
  if (date) {
    const expected = toSlashDate(date);
    const wrong = records.filter((r) => r.dateStr !== expected);
    if (wrong.length > 0) {
      issues.push({
        severity: "fail",
        message: `${wrong.length} row(s) dated ${[...new Set(wrong.map((r) => r.dateStr))].join(", ")}, filename says ${expected} (first: line ${wrong[0].line})`,
      });
    }
  }

  // --- net must be zero -------------------------------------------------
  // Only meaningful when every line parsed: a skipped malformed row would make
  // a balanced file look unbalanced and double-report one defect.
  const sumKobo = records.reduce((s, r) => s + r.kobo, ZERO);
  if (format.valid && records.length > 0 && sumKobo !== ZERO) {
    issues.push({ severity: "fail", message: `Rows sum to ${formatKobo(sumKobo)}, must be 0.00` });
  }

  // Any weekday is accepted without comment: holidays and the next business
  // day's early sessions are routinely merged in with the weekend.

  return {
    id,
    name,
    date,
    dateSegment,
    session,
    sessionLabel: session ? SESSION_BY_SEQ[String(session)] : undefined,
    records,
    sumKobo,
    lineEndings: split.lineEndings,
    formatIssues: format.issues,
    issues,
    valid: !issues.some((i) => i.severity === "fail"),
  };
}
