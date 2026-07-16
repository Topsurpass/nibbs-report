"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FileDropzone from "./FileDropzone";
import CheckSummary from "./CheckSummary";
import ReconciliationTable from "./ReconciliationTable";
import BreachSection from "./BreachSection";
import { decodeSettlementHtml, parseSettlementHtml, type FrameParseResult } from "@/lib/parseHtml";
import {
  parseEtranzactTxt,
  validateTxtFilename,
  type TxtParseResult,
} from "@/lib/parseTxt";
import type { MasterBank } from "@/lib/master";
import { reconcile, type BreachRecord } from "@/lib/reconcile";
import { downloadExcel, printReport } from "@/lib/exportReport";
import { formatNaira } from "@/lib/format";

function toDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
const breachKey = (b: Pick<BreachRecord, "code" | "kind">) => `${b.code}-${b.kind}`;

export default function SettlementAuditor({ master }: { master: MasterBank[] }) {
  const [reportDate, setReportDate] = useState("");

  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [txtFile, setTxtFile] = useState<File | null>(null);
  const [frame, setFrame] = useState<FrameParseResult | null>(null);
  const [txt, setTxt] = useState<TxtParseResult | null>(null);
  const [htmlError, setHtmlError] = useState<string>();
  const [txtError, setTxtError] = useState<string>();

  const [armed, setArmed] = useState(false);
  const [breachEdits, setBreachEdits] = useState<Record<string, Partial<BreachRecord>>>({});

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setReportDate(todayStr());
  }, []);

  const onHtml = useCallback(async (file: File) => {
    setHtmlError(undefined);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseSettlementHtml(decodeSettlementHtml(buf));
      setHtmlFile(file);
      setFrame(parsed);
      if (parsed.rows.length === 0) setHtmlError("No bank rows found in the HTML table.");
    } catch (e) {
      setHtmlFile(file);
      setFrame(null);
      setHtmlError(e instanceof Error ? e.message : "Failed to parse HTML.");
    }
  }, []);

  const onTxt = useCallback(async (file: File) => {
    setTxtError(undefined);
    try {
      const text = await file.text();
      const parsed = parseEtranzactTxt(text);
      setTxtFile(file);
      setTxt(parsed);
      if (parsed.rows.length === 0) setTxtError("No records parsed from the TXT.");
      else if (!parsed.format.valid)
        setTxtError(
          `⚠ ${parsed.format.issues.length} line(s) break the required format — see “Format deviations” after running the audit.`,
        );
    } catch (e) {
      setTxtFile(file);
      setTxt(null);
      setTxtError(e instanceof Error ? e.message : "Failed to read TXT.");
    }
  }, []);

  const result = useMemo(() => {
    if (!armed || !frame || !txt || !txtFile || !reportDate) return null;
    const rd = toDate(reportDate);
    const filenameCheck = validateTxtFilename(txtFile.name, rd);
    return reconcile({ frame, txt, master, reportDate: rd, filenameCheck });
  }, [armed, frame, txt, txtFile, reportDate, master]);

  const breaches = useMemo<BreachRecord[]>(() => {
    if (!result) return [];
    return result.breaches.map((b) => ({ ...b, ...breachEdits[breachKey(b)] }));
  }, [result, breachEdits]);

  const canRun = !!frame && !!txt;

  const htmlSummary = useMemo(() => {
    if (!frame) return undefined;
    return `${frame.rows.length} banks · dropped ${frame.droppedEmpty} empty, ${frame.droppedPocketMoni} PocketMoni · net sum ${formatNaira(
      frame.netSum,
    )}`;
  }, [frame]);

  const txtSummary = useMemo(() => {
    if (!txt) return undefined;
    const parts = [`${txt.rows.length} records`];
    if (txt.fileDates.length) parts.push(`date ${txt.fileDates.join(", ")}`);
    parts.push(
      txt.format.valid ? "format ✓" : `format ⚠ (${txt.format.issues.length})`,
    );
    if (txtFile && reportDate) {
      const chk = validateTxtFilename(txtFile.name, toDate(reportDate));
      parts.push(chk.ok ? "filename ✓" : "filename ⚠");
    }
    return parts.join(" · ");
  }, [txt, txtFile, reportDate]);

  const updateBreach = (i: number, patch: Partial<BreachRecord>) => {
    const key = breachKey(breaches[i]);
    setBreachEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));
  };

  return (
    <div>
      {/* Hero */}
      <header className="hero-gradient text-white">
        <div className="px-6 py-9 sm:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                Report
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Settlement Audit
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/80">
                Drop the settlement HTML and eTranzact file — the app runs every
                NIBBS_CHECKER validation and flags breaches for escalation.
              </p>
            </div>
            <label className="no-print rounded-xl bg-white/15 px-4 py-3 backdrop-blur">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-white/70">
                Report date
              </span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="mt-1 bg-transparent text-sm font-semibold text-white outline-none [color-scheme:dark]"
              />
            </label>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-6 py-8 sm:px-10">
        {/* Uploads */}
        <section className="no-print grid grid-cols-1 gap-4 md:grid-cols-2">
          <FileDropzone
            title="Settlement HTML (Data from Frame)"
            subtitle="The NET SETTLEMENT POSITION export from the settlement team"
            accept=".html,.htm"
            accent="teal"
            file={htmlFile}
            summary={htmlSummary}
            error={htmlError}
            onSelect={onHtml}
          />
          <FileDropzone
            title="eTranzact file (Smartdet)"
            subtitle="ETRANZACT_ddmmyyyy_n.txt"
            accept=".txt"
            accent="indigo"
            file={txtFile}
            summary={txtSummary}
            error={txtError}
            onSelect={onTxt}
          />
        </section>

        {/* Actions */}
        <section className="no-print flex flex-wrap items-center gap-3">
          <button
            onClick={() => setArmed(true)}
            disabled={!canRun}
            className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶ Run audit
          </button>
          {result && (
            <>
              <button
                onClick={() => downloadExcel(result, breaches, toDate(reportDate))}
                className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                ⬇ Download Excel
              </button>
              <button
                onClick={printReport}
                className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                🖨 Print / PDF
              </button>
            </>
          )}
          {result && (
            <span
              className={`ml-auto rounded-full px-3 py-1.5 text-xs font-bold ${
                result.hasFailures
                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {result.hasFailures ? "AUDIT FAILED — see flags" : "ALL CHECKS PASSED"}
            </span>
          )}
        </section>

        {/* Results */}
        {result && (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Validation checks
              </h2>
              <CheckSummary checks={result.checks} />
            </section>

            {result.formatIssues.length > 0 && (
              <section className="print-block overflow-hidden rounded-2xl border border-red-500/30 bg-surface shadow-sm">
                <div className="border-b border-red-500/20 bg-red-500/5 px-5 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                    <span aria-hidden>⚠</span> Format deviations — eTranzact file
                  </h2>
                  <p className="text-xs text-muted">
                    {result.formatIssues.length} line(s) do not match the required template. Fix
                    the file and re-upload before sending to NIBBS.
                  </p>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-surface/95 backdrop-blur">
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                        <th className="px-4 py-2 font-semibold">Line</th>
                        <th className="px-4 py-2 font-semibold">Problem</th>
                        <th className="px-4 py-2 font-semibold">Content</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.formatIssues.map((issue) => (
                        <tr key={issue.line} className="border-t border-border">
                          <td className="tnum px-4 py-2 font-semibold text-red-600 dark:text-red-400">
                            {issue.line}
                          </td>
                          <td className="px-4 py-2 text-foreground">{issue.message}</td>
                          <td className="tnum px-4 py-2 text-xs text-muted">
                            {issue.content || <span className="italic">(empty)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Frame net sum" value={formatNaira(result.totals.frameNetSum)} />
              <Stat label="Smartdet sum" value={formatNaira(result.totals.smartdetSum)} />
              <Stat label="Banks reconciled" value={String(result.rows.length)} />
              <Stat
                label="Breaches"
                value={String(breaches.length)}
                danger={breaches.length > 0}
              />
            </section>

            <ReconciliationTable rows={result.rows} />
            <BreachSection
              breaches={breaches}
              reportDate={toDate(reportDate)}
              onChange={updateBreach}
            />
          </>
        )}

        {!result && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center">
            <p className="text-sm text-muted">
              Upload both files and click <span className="font-semibold">Run audit</span> to
              see the reconciliation and breach report.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-muted">
          All processing happens locally in your browser — settlement data never leaves this
          machine.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="print-block rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`tnum mt-1 text-lg font-bold ${
          danger ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
