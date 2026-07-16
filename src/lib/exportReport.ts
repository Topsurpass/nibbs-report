// Downloadable report generation. Builds an .xlsx workbook (reconciliation +
// escalation sheets) with SheetJS. PDF is produced via the browser print dialog
// against the print stylesheet in globals.css.

import * as XLSX from "xlsx";
import type { ReconResult, BreachRecord } from "./reconcile";
import { toDdmmyyyy, formatNaira } from "./format";

function round2(n: number | null): number | string {
  if (n === null || !Number.isFinite(n)) return "";
  return Math.round(n * 100) / 100;
}

// Columns mirror NIBBS_CHECKER.xlsx "Breached Section For escalation" (F:K).
export const BREACH_COLUMNS = [
  "Bank",
  "Net Settlement Position",
  "Collateral",
  "Collateral Breach Variance",
  "Status",
  "Reason For Collateral Breach",
] as const;

function breachCells(b: BreachRecord): (string | number)[] {
  return [
    b.name,
    round2(b.netSettlementPosition),
    round2(b.collateral),
    round2(b.variance),
    b.status,
    b.reason,
  ];
}

/** Download just the escalation table as a standalone .xlsx. */
export function downloadBreachExcel(breaches: BreachRecord[], reportDate: Date): void {
  const aoa: (string | number)[][] = [
    ["Breached Section For Escalation"],
    [`Report date: ${toDdmmyyyy(reportDate)}`],
    [],
    [...BREACH_COLUMNS],
    ...breaches.map(breachCells),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Breached");
  XLSX.writeFile(wb, `NIBBS_Escalation_${toDdmmyyyy(reportDate)}.xlsx`);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build clipboard payloads for the escalation table:
 * - `html`: a styled <table> so it pastes as a real grid into Excel and email.
 * - `tsv`: tab-separated fallback that also pastes cleanly into a sheet.
 */
export function buildBreachClipboard(
  breaches: BreachRecord[],
  reportDate: Date,
): { html: string; tsv: string } {
  const headerCells = BREACH_COLUMNS.map(
    (c) =>
      `<th style="border:1px solid #999;background:#f2c94c;padding:4px 8px;text-align:left;font-family:Calibri,Arial,sans-serif;">${esc(
        c,
      )}</th>`,
  ).join("");

  const bodyRows = breaches
    .map((b) => {
      const cells = [
        { v: b.name, align: "left" },
        { v: formatNaira(b.netSettlementPosition), align: "right" },
        { v: b.collateral === null ? "" : formatNaira(b.collateral), align: "right" },
        { v: formatNaira(b.variance), align: "right" },
        { v: b.status, align: "left" },
        { v: b.reason, align: "left" },
      ];
      return `<tr>${cells
        .map(
          (c) =>
            `<td style="border:1px solid #999;padding:4px 8px;text-align:${c.align};font-family:Calibri,Arial,sans-serif;">${esc(
              c.v,
            )}</td>`,
        )
        .join("")}</tr>`;
    })
    .join("");

  const html =
    `<table style="border-collapse:collapse;border:1px solid #999;">` +
    `<tr><td colspan="${BREACH_COLUMNS.length}" style="border:1px solid #999;background:#c0392b;color:#fff;font-weight:bold;padding:6px 8px;font-family:Calibri,Arial,sans-serif;">Breached Section For Escalation — ${toDdmmyyyy(
      reportDate,
    )}</td></tr>` +
    `<tr>${headerCells}</tr>${bodyRows}</table>`;

  const tsvRows = [
    BREACH_COLUMNS.join("\t"),
    ...breaches.map((b) =>
      breachCells(b)
        .map((c) => String(c))
        .join("\t"),
    ),
  ];

  return { html, tsv: tsvRows.join("\n") };
}

export function buildWorkbook(
  result: ReconResult,
  breaches: BreachRecord[],
  reportDate: Date,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- Summary sheet ---
  const summaryRows: (string | number)[][] = [
    ["NIBBS Settlement Audit", ""],
    ["Report date", toDdmmyyyy(reportDate)],
    ["", ""],
    ["Check", "Status", "Detail"],
    ...result.checks.map((c) => [c.label, c.status.toUpperCase(), c.detail]),
    ["", ""],
    ["Frame net sum", round2(result.totals.frameNetSum)],
    ["Smartdet sum", round2(result.totals.smartdetSum)],
    ["Frame bank rows", result.totals.frameRowCount],
    ["Smartdet rows", result.totals.smartdetRowCount],
    ["Empty rows dropped", result.totals.droppedEmpty],
    ["PocketMoni rows dropped", result.totals.droppedPocketMoni],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  // --- Reconciliation sheet ---
  const reconHeader = [
    "Bank code",
    "Bank",
    "Collateral (C)",
    "Smartdet (H)",
    "Frame (O)",
    "Code match (A-G)",
    "Jive (H-O)",
    "Collateral chk (C+H)",
    "In master",
    "In HTML",
    "In eTranzact",
    "Flags",
  ];
  const reconRows = result.rows.map((r) => {
    const flags: string[] = [];
    if (r.jiveBreach) flags.push("JIVE");
    if (r.collateralBreach) flags.push("COLLATERAL");
    if (r.presenceIssue) flags.push("PRESENCE");
    return [
      r.code,
      r.name,
      round2(r.collateral),
      round2(r.smartdetAmount),
      round2(r.frameAmount),
      r.codeMatch === null ? "" : round2(r.codeMatch),
      round2(r.jive),
      round2(r.collateralCheck),
      r.inMaster ? "Y" : "N",
      r.inFrame ? "Y" : "N",
      r.inSmartdet ? "Y" : "N",
      flags.join(", "),
    ];
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([reconHeader, ...reconRows]),
    "Reconciliation",
  );

  // --- Breached (escalation) sheet ---
  const breachHeader = [
    "Bank",
    "Bank code",
    "Type",
    "Net Settlement Position",
    "Collateral",
    "Breach Variance",
    "Status",
    "Reason",
  ];
  const breachRows = breaches.map((b) => [
    b.name,
    b.code,
    b.kind === "collateral" ? "Collateral" : "Reconciliation",
    round2(b.netSettlementPosition),
    round2(b.collateral),
    round2(b.variance),
    b.status,
    b.reason,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Breached Section For Escalation"],
      [],
      breachHeader,
      ...breachRows,
    ]),
    "Breached",
  );

  return wb;
}

/** Build and download the .xlsx report. */
export function downloadExcel(
  result: ReconResult,
  breaches: BreachRecord[],
  reportDate: Date,
): void {
  const wb = buildWorkbook(result, breaches, reportDate);
  XLSX.writeFile(wb, `NIBBS_Audit_${toDdmmyyyy(reportDate)}.xlsx`);
}

/** Trigger the browser print dialog (Save as PDF) against the print stylesheet. */
export function printReport(): void {
  if (typeof window !== "undefined") window.print();
}
