// Merge weekend/holiday session files into one ETRANZACT file.
//
// Rules (agreed with Settlement):
//   - Rows are appended file after file; nothing is summed or de-duplicated.
//   - Order is by filename date, then session 1..4 (8am, 11am, 2pm, 5pm),
//     regardless of the order the files were uploaded in.
//   - The date column of every row is rewritten to the merge date.
//   - Type code, bank code and amount are copied byte-for-byte.
//   - Output uses CRLF between lines and no final newline, like NIBBS's files.

import type { CheckResult } from "../reconcile.ts";
import { toDdmmyyyy, toSlashDate } from "../format.ts";
import { validateTxtFormat } from "../parseTxt.ts";
import type { SessionLabel } from "../session/nibbsSession.ts";
import { isWeekend, type SessionNo, type SourceFile } from "./sourceFile.ts";
import type { HolidayLookup } from "../holidays/parseIcs.ts";
import { holidayFor } from "./holidays.ts";
import { formatKobo, ZERO } from "./text.ts";

export const MERGED_LINE_BREAK = "\r\n";

export interface MergedRow {
  /** 1-based row number in the merged file. */
  row: number;
  /** The exact line written to the merged file. */
  line: string;
  code: string;
  amountStr: string;
  kobo: bigint;
  sourceName: string;
  sourceLine: number;
  sourceDate: Date;
  sourceSession: SessionNo;
  sourceSessionLabel: SessionLabel;
}

export interface MergeResult {
  fileName: string;
  text: string;
  rows: MergedRow[];
  /** Sources in merge order. */
  sources: SourceFile[];
  sumKobo: bigint;
}

/** Valid, dated sources first in (date, session) order; everything else after, by name. */
export function sortSources(files: SourceFile[]): SourceFile[] {
  const key = (f: SourceFile) => (f.date && f.session ? f.date.getTime() * 10 + f.session : Infinity);
  return [...files].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
}

export function mergedFileName(mergeDate: Date, session: SessionNo): string {
  return `ETRANZACT_${toDdmmyyyy(mergeDate)}_${session}.txt`;
}

/** The date the merge date counts from: the latest Saturday/Sunday, else the latest date. */
function weekendAnchor(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  const weekend = dates.filter(isWeekend);
  return new Date(Math.max(...(weekend.length ? weekend : dates).map((d) => d.getTime())));
}

/**
 * The next business day after the weekend: the day after the latest Saturday
 * or Sunday file, skipping weekends and public holidays. Weekday files (e.g.
 * Monday's) don't move it, so Sat + Sun + Mon still merges into Monday, while
 * a Monday holiday makes it Tuesday. With no weekend file (a lone Friday
 * holiday), it counts from the latest file; with no dated file, it is today.
 */
export function defaultMergeDate(
  sources: SourceFile[],
  holidays: HolidayLookup = () => undefined,
  today: Date = new Date(),
): Date {
  const anchor = weekendAnchor(sources.map((s) => s.date).filter((d): d is Date => d !== null));
  if (!anchor) return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1);
  while (isWeekend(next) || holidayFor(next, holidays)) next.setDate(next.getDate() + 1);
  return next;
}

/** Build the merged file from every valid source. Invalid sources are never merged. */
export function buildMerge(files: SourceFile[], mergeDate: Date, session: SessionNo): MergeResult {
  const sources = sortSources(files).filter((f) => f.valid && f.date && f.session && f.sessionLabel);
  const slashDate = toSlashDate(mergeDate);
  const rows: MergedRow[] = [];
  for (const src of sources) {
    for (const rec of src.records) {
      rows.push({
        row: rows.length + 1,
        line: [rec.typeCode, slashDate, rec.code, rec.amountStr].join("\t"),
        code: rec.code,
        amountStr: rec.amountStr,
        kobo: rec.kobo,
        sourceName: src.name,
        sourceLine: rec.line,
        sourceDate: src.date as Date,
        sourceSession: src.session as SessionNo,
        sourceSessionLabel: src.sessionLabel as SessionLabel,
      });
    }
  }
  return {
    fileName: mergedFileName(mergeDate, session),
    text: rows.map((r) => r.line).join(MERGED_LINE_BREAK),
    rows,
    sources,
    sumKobo: rows.reduce((s, r) => s + r.kobo, ZERO),
  };
}

/** Checks on the merged output itself. */
export function mergeChecks(
  merge: MergeResult,
  mergeDate: Date,
  holidays: HolidayLookup = () => undefined,
): CheckResult[] {
  const checks: CheckResult[] = [];

  const expectedRows = merge.sources.reduce((n, s) => n + s.records.length, 0);
  checks.push({
    id: "merged-rows",
    label: "Every source row carried over",
    status: merge.rows.length === expectedRows && expectedRows > 0 ? "pass" : "fail",
    detail: `${merge.rows.length} merged row(s) from ${merge.sources.length} file(s); sources hold ${expectedRows}.`,
  });

  checks.push({
    id: "merged-sum-zero",
    label: "Merged net = 0",
    status: merge.sumKobo === ZERO ? "pass" : "fail",
    detail: `Sum of all ${merge.rows.length} amounts: ${formatKobo(merge.sumKobo)}.`,
  });

  const format = validateTxtFormat(merge.text);
  checks.push({
    id: "merged-format",
    label: "Merged file matches the record template",
    status: format.valid && merge.rows.length > 0 ? "pass" : "fail",
    detail: format.valid
      ? "702 ⇥ YYYY/MM/DD ⇥ 10-digit code ⇥ ±17.2 amount, CRLF, no trailing newline."
      : `${format.issues.length} line(s) deviate (first: line ${format.issues[0].line}, ${format.issues[0].message}).`,
  });

  // Same rule as defaultMergeDate: after the weekend, so Sat + Sun + Mon
  // merged into Monday is right, not "before the last file".
  const anchor = weekendAnchor(merge.sources.map((s) => s.date).filter((d): d is Date => d !== null));
  const afterWeekend = !anchor || mergeDate > anchor;
  const holiday = holidayFor(mergeDate, holidays);
  checks.push({
    id: "merge-date",
    label: "Merge date is the next business day",
    status: afterWeekend && !isWeekend(mergeDate) && !holiday ? "pass" : "warn",
    detail: !afterWeekend
      ? `Merge date ${toSlashDate(mergeDate)} is not after the weekend (${toSlashDate(anchor as Date)}).`
      : isWeekend(mergeDate)
        ? `Merge date ${toSlashDate(mergeDate)} falls on a weekend.`
        : holiday
          ? `Merge date ${toSlashDate(mergeDate)} is a public holiday (${holiday.name}).`
          : `Every row is dated ${toSlashDate(mergeDate)}.`,
  });

  return checks;
}
