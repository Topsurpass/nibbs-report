// Parser for the eTranzact settlement TXT ("Smartdet" source).
// Tab-delimited, CRLF, 4 fields per line:
//   702 | YYYY/MM/DD | 10-digit code | signed zero-padded amount
// e.g. "702\t2026/07/15\t4000470158\t-00000063656071194.99"

import { parseTxtAmount, parseDdmmyyyy, parseSlashDate, sameDay, toDdmmyyyy } from "./format.ts";

export interface SmartdetRow {
  typeCode: string; // "702"
  dateStr: string; // "YYYY/MM/DD"
  code: string; // 10-digit bank code
  amount: number; // Smartdet net amount (column H)
}

export interface TxtFormatIssue {
  /** 1-based line number in the file. */
  line: number;
  /** The offending line content (with tabs shown as ⇥ for readability). */
  content: string;
  /** Precise description of what deviates from the required template. */
  message: string;
}

export interface TxtFormatResult {
  valid: boolean;
  issues: TxtFormatIssue[];
  /** Number of non-trailing lines examined. */
  checkedLines: number;
}

export interface TxtParseResult {
  rows: SmartdetRow[];
  /** Distinct in-file dates encountered (should be exactly one). */
  fileDates: string[];
  /** Lines that could not be parsed into 4 fields. */
  malformed: number;
  /** Strict format-gate result for the whole file. */
  format: TxtFormatResult;
}

// The exact eTranzact record template. Fields are single-TAB separated:
//   702 \t YYYY/MM/DD \t <10-digit account> \t <±17 digits.2 decimals>
const RECORD_TYPE = "702";
const LINE_RE = /^702\t\d{4}\/\d{2}\/\d{2}\t\d{10}\t[+-]\d{17}\.\d{2}$/;
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const ACCOUNT_RE = /^\d{10}$/;
const AMOUNT_RE = /^[+-]\d{17}\.\d{2}$/;

/** Build a precise, human-readable reason for a line that fails the template. */
function diagnoseLine(line: string): string {
  const parts = line.split("\t");
  if (parts.length !== 4) {
    return `fields must be separated by a single TAB (found ${parts.length} field${
      parts.length === 1 ? "" : "s"
    }${/ {2,}| \S| $|^\S* \S/.test(line) ? "; looks like spaces were used" : ""})`;
  }
  const [type, date, account, amount] = parts;
  const reasons: string[] = [];
  if (type !== RECORD_TYPE) reasons.push(`record type must be ${RECORD_TYPE} (got "${type}")`);
  if (!DATE_RE.test(date) || !parseSlashDate(date)) {
    reasons.push(`date must be YYYY/MM/DD (got "${date}")`);
  }
  if (!ACCOUNT_RE.test(account)) {
    reasons.push(`account must be exactly 10 digits (got "${account}", ${account.length} chars)`);
  }
  if (!AMOUNT_RE.test(amount)) {
    reasons.push(
      `amount must be a +/- sign, 17 digits, "." and 2 decimals (got "${amount}")`,
    );
  }
  return reasons.length ? reasons.join("; ") : "does not match the required record format";
}

/**
 * Strict gate: every non-empty line must match the exact eTranzact template.
 * Tolerates CRLF/LF and a single trailing newline; flags everything else.
 */
export function validateTxtFormat(text: string): TxtFormatResult {
  const rawLines = text.split("\n");
  // Drop exactly one trailing empty element caused by a final newline.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();

  const issues: TxtFormatIssue[] = [];
  rawLines.forEach((raw, idx) => {
    const line = raw.replace(/\r$/, "");
    const lineNo = idx + 1;
    if (line.length === 0) {
      issues.push({ line: lineNo, content: "", message: "blank line — not allowed" });
      return;
    }
    if (!LINE_RE.test(line)) {
      issues.push({
        line: lineNo,
        content: line.replace(/\t/g, "⇥"),
        message: diagnoseLine(line),
      });
    }
  });

  return { valid: issues.length === 0, issues, checkedLines: rawLines.length };
}

export function parseEtranzactTxt(text: string): TxtParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: SmartdetRow[] = [];
  const dateSet = new Set<string>();
  let malformed = 0;

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 4) {
      malformed++;
      continue;
    }
    const [typeCode, dateStr, code, amountStr] = parts.map((p) => p.trim());
    const amount = parseTxtAmount(amountStr);
    if (!/^\d{6,}$/.test(code) || !Number.isFinite(amount)) {
      malformed++;
      continue;
    }
    dateSet.add(dateStr);
    rows.push({ typeCode, dateStr, code, amount });
  }

  return {
    rows,
    fileDates: Array.from(dateSet),
    malformed,
    format: validateTxtFormat(text),
  };
}

export interface FilenameCheck {
  ok: boolean;
  /** ddmmyyyy segment parsed from the name, if the pattern matched. */
  dateSegment?: string;
  /** Sequence number (the trailing _N). */
  sequence?: string;
  /** Human-readable reason when not ok. */
  reason?: string;
  /** True when the filename date equals the report date. */
  matchesReportDate: boolean;
}

const FILENAME_RE = /^ETRANZACT_(\d{8})_(\d+)\.txt$/i;

/**
 * Validate "ETRANZACT_<ddmmyyyy>_<n>.txt" and compare its date to the report date.
 */
export function validateTxtFilename(name: string, reportDate: Date): FilenameCheck {
  const m = name.match(FILENAME_RE);
  if (!m) {
    return {
      ok: false,
      matchesReportDate: false,
      reason: `Name must be ETRANZACT_<ddmmyyyy>_<n>.txt (got "${name}")`,
    };
  }
  const [, dateSegment, sequence] = m;
  const parsed = parseDdmmyyyy(dateSegment);
  if (!parsed) {
    return {
      ok: false,
      dateSegment,
      sequence,
      matchesReportDate: false,
      reason: `"${dateSegment}" is not a valid ddmmyyyy date`,
    };
  }
  const matchesReportDate = sameDay(parsed, reportDate);
  return {
    ok: matchesReportDate,
    dateSegment,
    sequence,
    matchesReportDate,
    reason: matchesReportDate
      ? undefined
      : `Filename date ${dateSegment} ≠ report date ${toDdmmyyyy(reportDate)}`,
  };
}

/**
 * True when every in-file date matches the report date (mirrors the L = F - TODAY()
 * date check: all rows should share the report day).
 */
export function txtDatesMatchReport(fileDates: string[], reportDate: Date): boolean {
  if (fileDates.length === 0) return false;
  return fileDates.every((d) => {
    const parsed = parseSlashDate(d);
    return sameDay(parsed, reportDate);
  });
}
