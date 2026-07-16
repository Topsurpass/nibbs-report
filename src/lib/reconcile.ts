// Reconciliation engine — replicates NIBBS_CHECKER.xlsx Sheet1.
// Per bank (joined by 10-digit code):
//   J = A - G  (master code vs Smartdet code)      → must be 0
//   P = H - O  (Smartdet amount vs Frame amount)    → must be 0  ("Jive check")
//   Q = C + H  (Collateral + net position)          → < 0 is a collateral breach
// Plus the HTML net-settlement-sum = 0 check and file naming/date checks.

import { centsEqual, toCents } from "./format";
import type { FrameParseResult } from "./parseHtml";
import type { TxtParseResult, FilenameCheck, TxtFormatIssue } from "./parseTxt";
import { txtDatesMatchReport } from "./parseTxt";
import type { MasterBank } from "./master";

export type CheckStatus = "pass" | "fail" | "warn";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ReconRow {
  code: string;
  name: string;
  inMaster: boolean;
  inFrame: boolean;
  inSmartdet: boolean;
  collateral: number | null; // C
  frameAmount: number | null; // O
  smartdetAmount: number | null; // H
  codeMatch: number | null; // J = A - G
  jive: number | null; // P = H - O
  collateralCheck: number | null; // Q = C + H
  jiveBreach: boolean; // P != 0
  collateralBreach: boolean; // Q < 0
  /** In a source but not another in a way that blocks reconciliation. */
  presenceIssue: boolean;
}

export type BreachKind = "collateral" | "reconciliation";

export interface BreachRecord {
  code: string;
  name: string;
  kind: BreachKind;
  /** Net settlement position used for escalation (Smartdet H, falling back to Frame O). */
  netSettlementPosition: number;
  collateral: number | null;
  /** C + H for collateral breaches; H - O for reconciliation breaches. */
  variance: number;
  status: string; // default "UNACCEPTABLE"
  reason: string; // editable
}

export interface ReconResult {
  rows: ReconRow[];
  checks: CheckResult[];
  breaches: BreachRecord[];
  totals: {
    frameNetSum: number;
    smartdetSum: number;
    frameRowCount: number;
    smartdetRowCount: number;
    droppedEmpty: number;
    droppedPocketMoni: number;
  };
  /** Codes present in a source but missing from another. */
  presence: {
    inFrameNotMaster: string[];
    inSmartdetNotMaster: string[];
    inSmartdetNotFrame: string[];
    inFrameNotSmartdet: string[];
    inMasterNotFrame: string[];
  };
  /** Strict eTranzact format deviations (empty when the file conforms). */
  formatIssues: TxtFormatIssue[];
  hasFailures: boolean;
}

const DEFAULT_STATUS = "UNACCEPTABLE";
const DEFAULT_COLLATERAL_REASON = "SwitchIT transfers";
const DEFAULT_RECON_REASON = "Smartdet vs Frame mismatch — investigate";

export interface ReconInput {
  frame: FrameParseResult;
  txt: TxtParseResult;
  master: MasterBank[];
  reportDate: Date;
  filenameCheck: FilenameCheck;
}

export function reconcile(input: ReconInput): ReconResult {
  const { frame, txt, master, reportDate, filenameCheck } = input;

  const masterByCode = new Map(master.map((m) => [m.code, m]));
  const frameByCode = new Map(frame.rows.map((r) => [r.code, r]));
  const smartByCode = new Map(txt.rows.map((r) => [r.code, r]));

  // Row universe: every code seen anywhere, ordered by master position first.
  const orderedCodes: string[] = [];
  const seen = new Set<string>();
  for (const m of master) {
    orderedCodes.push(m.code);
    seen.add(m.code);
  }
  const extras: string[] = [];
  for (const code of [...frameByCode.keys(), ...smartByCode.keys()]) {
    if (!seen.has(code)) {
      seen.add(code);
      extras.push(code);
    }
  }
  extras.sort((a, b) => {
    const na = frameByCode.get(a)?.name ?? smartByCode.get(a)?.code ?? a;
    const nb = frameByCode.get(b)?.name ?? smartByCode.get(b)?.code ?? b;
    return na.localeCompare(nb);
  });
  orderedCodes.push(...extras);

  const rows: ReconRow[] = [];
  const breaches: BreachRecord[] = [];

  for (const code of orderedCodes) {
    const m = masterByCode.get(code);
    const f = frameByCode.get(code);
    const s = smartByCode.get(code);
    const inMaster = !!m;
    const inFrame = !!f;
    const inSmartdet = !!s;

    // Only surface rows that appear in at least one uploaded file, plus any
    // master bank that's expected but missing, so nothing is silently dropped.
    if (!inFrame && !inSmartdet && inMaster) {
      // Master bank absent from today's settlement — expected (manual process
      // trims these). Record for the presence report but not as a grid row.
      continue;
    }

    const collateral = m ? m.collateral : null;
    const frameAmount = f ? f.netPosition : null;
    const smartdetAmount = s ? s.amount : null;
    const name = m?.name ?? f?.name ?? code;

    const codeMatch = inMaster && inSmartdet ? 0 : null; // J = A - G
    const jive =
      inFrame && inSmartdet ? (smartdetAmount as number) - (frameAmount as number) : null;
    const collateralCheck =
      inMaster && inSmartdet ? (collateral as number) + (smartdetAmount as number) : null;

    const jiveBreach = jive !== null && toCents(jive) !== 0;
    const collateralBreach = collateralCheck !== null && toCents(collateralCheck) < 0;
    const presenceIssue =
      (inSmartdet && !inFrame) || (inFrame && !inSmartdet) || (!inMaster && (inFrame || inSmartdet));

    rows.push({
      code,
      name,
      inMaster,
      inFrame,
      inSmartdet,
      collateral,
      frameAmount,
      smartdetAmount,
      codeMatch,
      jive,
      collateralCheck,
      jiveBreach,
      collateralBreach,
      presenceIssue,
    });

    if (collateralBreach) {
      breaches.push({
        code,
        name,
        kind: "collateral",
        netSettlementPosition: (smartdetAmount as number),
        collateral,
        variance: collateralCheck as number,
        status: DEFAULT_STATUS,
        reason: DEFAULT_COLLATERAL_REASON,
      });
    }
    if (jiveBreach) {
      breaches.push({
        code,
        name,
        kind: "reconciliation",
        netSettlementPosition: (smartdetAmount ?? frameAmount) as number,
        collateral,
        variance: jive as number,
        status: DEFAULT_STATUS,
        reason: DEFAULT_RECON_REASON,
      });
    }
  }

  // Presence diagnostics.
  const presence = {
    inFrameNotMaster: frame.rows.filter((r) => !masterByCode.has(r.code)).map((r) => r.code),
    inSmartdetNotMaster: txt.rows.filter((r) => !masterByCode.has(r.code)).map((r) => r.code),
    inSmartdetNotFrame: txt.rows.filter((r) => !frameByCode.has(r.code)).map((r) => r.code),
    inFrameNotSmartdet: frame.rows.filter((r) => !smartByCode.has(r.code)).map((r) => r.code),
    inMasterNotFrame: master.filter((m) => !frameByCode.has(m.code)).map((m) => m.code),
  };

  const smartdetSum = txt.rows.reduce((sum, r) => sum + r.amount, 0);

  // ---- Top-level checks ----
  const checks: CheckResult[] = [];

  // Check 1 — HTML net settlement sum = 0.
  const netSumZero = centsEqual(frame.netSum, 0);
  checks.push({
    id: "net-sum-zero",
    label: "Net settlement position sums to zero",
    status: frame.rows.length === 0 ? "warn" : netSumZero ? "pass" : "fail",
    detail:
      frame.rows.length === 0
        ? "No settlement rows parsed from the HTML."
        : `Sum of ${frame.rows.length} banks = ${frame.netSum.toFixed(2)}${
            netSumZero ? " (balanced)" : " — should be 0.00"
          }`,
  });

  // Check 2 — TXT filename convention + date.
  checks.push({
    id: "filename",
    label: "eTranzact filename & date",
    status: filenameCheck.ok ? "pass" : "fail",
    detail: filenameCheck.ok
      ? `Valid: ETRANZACT_${filenameCheck.dateSegment}_${filenameCheck.sequence}.txt`
      : filenameCheck.reason ?? "Invalid filename",
  });

  // Check 2b — strict eTranzact file format (exact template, no deviation).
  const fmt = txt.format;
  const firstIssues = fmt.issues
    .slice(0, 4)
    .map((i) => `L${i.line}: ${i.message}`)
    .join(" · ");
  checks.push({
    id: "txt-format",
    label: "eTranzact file format (strict)",
    status: fmt.checkedLines === 0 ? "warn" : fmt.valid ? "pass" : "fail",
    detail: fmt.valid
      ? `All ${fmt.checkedLines} line(s) match the required format.`
      : `${fmt.issues.length} line(s) deviate — ${firstIssues}${
          fmt.issues.length > 4 ? ` · +${fmt.issues.length - 4} more` : ""
        }`,
  });

  // Check 3 — in-file dates consistent with the report date.
  const datesOk = txtDatesMatchReport(txt.fileDates, reportDate);
  checks.push({
    id: "dates",
    label: "Smartdet dates match report date",
    status: txt.rows.length === 0 ? "warn" : datesOk ? "pass" : "fail",
    detail:
      txt.fileDates.length === 0
        ? "No dated rows parsed from the TXT."
        : `File date(s): ${txt.fileDates.join(", ")}${datesOk ? "" : " — differ from report date"}`,
  });

  // Check 4 — every Smartdet code resolves to a master bank (A - G = 0).
  const codeMismatch = presence.inSmartdetNotMaster.length;
  checks.push({
    id: "code-match",
    label: "Bank code match (Smartdet ↔ master)",
    status: txt.rows.length === 0 ? "warn" : codeMismatch === 0 ? "pass" : "fail",
    detail:
      codeMismatch === 0
        ? "All Smartdet codes found in the master bank list."
        : `${codeMismatch} Smartdet code(s) not in master: ${presence.inSmartdetNotMaster.join(", ")}`,
  });

  // Check 5 — Frame and Smartdet cover the same banks.
  const coverageMismatch =
    presence.inSmartdetNotFrame.length + presence.inFrameNotSmartdet.length;
  checks.push({
    id: "coverage",
    label: "Frame ↔ Smartdet bank coverage",
    status:
      frame.rows.length === 0 || txt.rows.length === 0
        ? "warn"
        : coverageMismatch === 0
          ? "pass"
          : "warn",
    detail:
      coverageMismatch === 0
        ? "HTML and eTranzact cover the same banks."
        : `In HTML only: ${fmtList(presence.inFrameNotSmartdet)}; in eTranzact only: ${fmtList(
            presence.inSmartdetNotFrame,
          )}`,
  });

  // Check 6 — Jive reconciliation (P = H - O = 0 for all).
  const jiveBreaches = rows.filter((r) => r.jiveBreach).length;
  checks.push({
    id: "jive",
    label: "Jive check (Smartdet = Frame)",
    status:
      frame.rows.length === 0 || txt.rows.length === 0
        ? "warn"
        : jiveBreaches === 0
          ? "pass"
          : "fail",
    detail:
      jiveBreaches === 0
        ? "Every bank reconciles (H − O = 0)."
        : `${jiveBreaches} bank(s) fail reconciliation (H − O ≠ 0).`,
  });

  // Check 7 — Collateral coverage (Q = C + H ≥ 0).
  const collateralBreaches = rows.filter((r) => r.collateralBreach).length;
  checks.push({
    id: "collateral",
    label: "Collateral coverage (C + H ≥ 0)",
    status:
      txt.rows.length === 0 ? "warn" : collateralBreaches === 0 ? "pass" : "fail",
    detail:
      collateralBreaches === 0
        ? "No collateral breaches."
        : `${collateralBreaches} bank(s) breach collateral — see escalation section.`,
  });

  const hasFailures = checks.some((c) => c.status === "fail");

  return {
    rows,
    checks,
    breaches,
    totals: {
      frameNetSum: frame.netSum,
      smartdetSum,
      frameRowCount: frame.rows.length,
      smartdetRowCount: txt.rows.length,
      droppedEmpty: frame.droppedEmpty,
      droppedPocketMoni: frame.droppedPocketMoni,
    },
    presence,
    formatIssues: txt.format.issues,
    hasFailures,
  };
}

function fmtList(codes: string[]): string {
  return codes.length ? codes.join(", ") : "none";
}
