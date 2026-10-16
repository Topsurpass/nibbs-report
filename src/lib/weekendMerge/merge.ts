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

/** Next Monday-Friday after the latest source date (today when there are no dated sources). */
export function defaultMergeDate(sources: SourceFile[], today: Date = new Date()): Date {
  const dates = sources.map((s) => s.date).filter((d): d is Date => d !== null);
  if (dates.length === 0) return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const next = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + 1);
  while (isWeekend(next)) next.setDate(next.getDate() + 1);
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
export function mergeChecks(merge: MergeResult, mergeDate: Date): CheckResult[] {
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

  const latest = merge.sources.reduce<Date | null>(
    (m, s) => (s.date && (!m || s.date > m) ? s.date : m),
    null,
  );
  const afterSources = !latest || mergeDate > latest;
  checks.push({
    id: "merge-date",
    label: "Merge date is the next business day",
    status: afterSources && !isWeekend(mergeDate) ? "pass" : "warn",
    detail: !afterSources
      ? `Merge date ${toSlashDate(mergeDate)} is not after the last source date ${toSlashDate(latest as Date)}.`
      : isWeekend(mergeDate)
        ? `Merge date ${toSlashDate(mergeDate)} falls on a weekend.`
        : `Every row is dated ${toSlashDate(mergeDate)}.`,
  });

  return checks;
}
