// Compare our merged file with the merged file Settlement sends, row by row.
// The comparison is on exact row text: tabs vs spaces, dates, codes, amounts
// and row order all count. Line endings do not: LF and CRLF are equivalent
// (Settlement's tool joins session files with a bare LF), so a row is compared
// on its content alone. Every mismatch says why.

import type { CheckResult } from "../reconcile.ts";
import { validateTxtFormat } from "../parseTxt.ts";
import { SOURCE_NAME_RE } from "./sourceFile.ts";
import { amountToKobo, formatKobo, splitLinesExact, ZERO, type SplitLine } from "./text.ts";

export type MismatchKind =
  | "whitespace"
  | "type"
  | "date"
  | "code"
  | "amount"
  | "order"
  | "missing"
  | "extra";

export const MISMATCH_LABELS: Record<MismatchKind, string> = {
  whitespace: "Spacing",
  type: "Record type",
  date: "Date",
  code: "Bank code",
  amount: "Amount",
  order: "Order",
  missing: "Missing row",
  extra: "Extra row",
};

export interface RowDiff {
  /** 1-based row number. */
  row: number;
  ours: string | null;
  theirs: string | null;
  ok: boolean;
  kinds: MismatchKind[];
  reasons: string[];
}

export interface ComparisonResult {
  checks: CheckResult[];
  rows: RowDiff[];
  matched: number;
  mismatched: number;
  byKind: Partial<Record<MismatchKind, number>>;
  /** True when no check fails. */
  pass: boolean;
}

export interface NamedText {
  name: string;
  text: string;
}

const FIELD_NAMES: MismatchKind[] = ["type", "date", "code", "amount"];

/** Say precisely what is wrong with a row's separators, in plain words. */
export function spacingReason(line: string): string {
  const problems: string[] = [];
  if (/^\s/.test(line)) problems.push("leading space/tab before the record");
  if (/[ \t]+$/.test(line)) problems.push("trailing space/tab after the amount");
  const inner = line.trim();
  if (/ /.test(inner)) problems.push("space used where a single tab is required");
  if (/\t{2,}/.test(inner)) problems.push("double tab between fields");
  if (/\r/.test(line)) problems.push("stray carriage return inside the row");
  return problems.length ? `Spacing: ${problems.join("; ")}` : "Spacing: field separators differ";
}

function diffRow(i: number, o: SplitLine | undefined, t: SplitLine | undefined, ours: SplitLine[], theirs: SplitLine[]): RowDiff {
  const row = i + 1;
  if (!t) {
    return { row, ours: o!.content, theirs: null, ok: false, kinds: ["missing"], reasons: ["Row missing from Settlement's file"] };
  }
  if (!o) {
    return { row, ours: null, theirs: t.content, ok: false, kinds: ["extra"], reasons: ["Extra row not in our merged file"] };
  }

  const kinds: MismatchKind[] = [];
  const reasons: string[] = [];

  if (o.content !== t.content) {
    // A row that exactly matches one of our rows whose slot isn't already
    // satisfied is in the wrong position, not wrong content.
    // Real files repeat identical lines, so pick the NEAREST unsatisfied match.
    let home = -1;
    for (let j = 0; j < ours.length; j++) {
      if (j === i || ours[j].content !== t.content || theirs[j]?.content === ours[j].content) continue;
      if (home === -1 || Math.abs(j - i) < Math.abs(home - i)) home = j;
    }
    if (home !== -1) {
      kinds.push("order");
      reasons.push(`Out of order: this row belongs at row ${home + 1}`);
    } else {
      const expected = o.content.split("\t");
      const tabFields = t.content.split("\t");
      const tokens = t.content.trim().split(/\s+/);
      if (tabFields.length !== 4 || /[ \r]/.test(t.content) || tabFields.some((f) => f === "")) {
        kinds.push("whitespace");
        reasons.push(spacingReason(t.content));
      }
      FIELD_NAMES.forEach((name, k) => {
        if (tokens[k] !== expected[k]) {
          kinds.push(name);
          reasons.push(`${MISMATCH_LABELS[name]}: expected "${expected[k]}", got "${tokens[k] ?? ""}"`);
        }
      });
      if (tokens.length > 4) {
        if (!kinds.includes("whitespace")) kinds.push("whitespace");
        reasons.push(`${tokens.length - 4} unexpected extra field(s)`);
      }
      if (kinds.length === 0) {
        kinds.push("whitespace");
        reasons.push("Row differs in invisible characters");
      }
    }
  }

  return { row, ours: o.content, theirs: t.content, ok: kinds.length === 0, kinds, reasons };
}

function filenameDetail(ours: string, theirs: string): string {
  const a = ours.match(SOURCE_NAME_RE);
  const b = theirs.match(SOURCE_NAME_RE);
  if (!b) return `Settlement's name "${theirs}" is not ETRANZACT_<ddmmyyyy>_<n>.txt; expected "${ours}".`;
  const parts: string[] = [];
  if (a && a[1] !== b[1]) parts.push(`date ${b[1]} ≠ ${a[1]}`);
  if (a && a[2] !== b[2]) parts.push(`session _${b[2]} ≠ _${a[2]}`);
  return `Expected "${ours}", got "${theirs}"${parts.length ? ` (${parts.join(", ")})` : ""}.`;
}

export function compareWithSettlement(ours: NamedText, theirs: NamedText): ComparisonResult {
  const o = splitLinesExact(ours.text);
  const t = splitLinesExact(theirs.text);

  const rows: RowDiff[] = [];
  for (let i = 0; i < Math.max(o.lines.length, t.lines.length); i++) {
    rows.push(diffRow(i, o.lines[i], t.lines[i], o.lines, t.lines));
  }
  const byKind: Partial<Record<MismatchKind, number>> = {};
  for (const r of rows) for (const k of r.kinds) byKind[k] = (byKind[k] ?? 0) + 1;
  const matched = rows.filter((r) => r.ok).length;
  const mismatched = rows.length - matched;

  const checks: CheckResult[] = [];

  checks.push({
    id: "cmp-filename",
    label: "Filename matches",
    status: ours.name === theirs.name ? "pass" : "fail",
    detail: ours.name === theirs.name ? ours.name : filenameDetail(ours.name, theirs.name),
  });

  const format = validateTxtFormat(theirs.text);
  checks.push({
    id: "cmp-format",
    label: "Settlement's file matches the record template",
    status: format.valid ? "pass" : "fail",
    detail: format.valid
      ? `${format.checkedLines} line(s), all 702 ⇥ YYYY/MM/DD ⇥ code ⇥ amount.`
      : `${format.issues.length} line(s) deviate (first: line ${format.issues[0].line}, ${format.issues[0].message}).`,
  });

  let sum = ZERO;
  let parsed = 0;
  for (const l of t.lines) {
    const kobo = amountToKobo(l.content.trim().split(/\s+/)[3] ?? "");
    if (kobo !== null) {
      sum += kobo;
      parsed++;
    }
  }
  checks.push({
    id: "cmp-sum-zero",
    label: "Settlement's net = 0",
    status: parsed > 0 && sum === ZERO ? "pass" : "fail",
    detail: parsed > 0 ? `Sum of ${parsed} amount(s): ${formatKobo(sum)}.` : "No amounts could be read.",
  });

  checks.push({
    id: "cmp-row-count",
    label: "Same number of rows",
    status: o.lines.length === t.lines.length ? "pass" : "fail",
    detail: `Ours ${o.lines.length}, Settlement's ${t.lines.length}.`,
  });

  checks.push({
    id: "cmp-trailing-newline",
    label: "No trailing newline",
    status: t.trailingNewline === o.trailingNewline ? "pass" : "warn",
    detail: t.trailingNewline
      ? "Settlement's file ends with an extra line break after the last row."
      : o.trailingNewline
        ? "Settlement's file has no final line break, ours does."
        : "Last row ends without a line break, as expected.",
  });

  const kindSummary = (Object.keys(byKind) as MismatchKind[])
    .map((k) => `${MISMATCH_LABELS[k]} ${byKind[k]}`)
    .join(", ");
  checks.push({
    id: "cmp-rows",
    label: "Every row identical",
    status: mismatched === 0 && rows.length > 0 ? "pass" : "fail",
    detail:
      mismatched === 0
        ? `${matched} of ${rows.length} rows match exactly.`
        : `${mismatched} of ${rows.length} rows differ (${kindSummary}).`,
  });

  return {
    checks,
    rows,
    matched,
    mismatched,
    byKind,
    pass: !checks.some((c) => c.status === "fail"),
  };
}

export interface DiffSegment {
  text: string;
  changed: boolean;
}

/**
 * Split `theirs` into fields and separators, marking each one that differs
 * from the same position in `ours`. Used to highlight exactly what is wrong
 * in a row (a space where a tab belongs, one wrong digit block, etc.).
 */
export function diffSegments(ours: string | null, theirs: string): DiffSegment[] {
  const split = (s: string) => s.split(/(\s+)/).filter((p) => p !== "");
  const a = ours === null ? [] : split(ours);
  return split(theirs).map((text, i) => ({ text, changed: a[i] !== text }));
}
