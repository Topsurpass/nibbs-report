"use client";

import { useEffect, useMemo } from "react";
import { Play, Download, AlertTriangle, CheckCircle2, TriangleAlert, Receipt } from "lucide-react";
import PageHeader from "./layout/PageHeader";
import FileDropzone from "./FileDropzone";
import CheckSummary from "./CheckSummary";
import ReconciliationTable from "./ReconciliationTable";
import BreachSection from "./BreachSection";
import { validateTxtFilename } from "@/lib/parseTxt";
import { reconcile, type BreachRecord } from "@/lib/reconcile";
import { downloadExcel } from "@/lib/exportReport";
import { formatNaira } from "@/lib/format";
import { sessionRowLabel } from "@/lib/session/nibbsSession";
import type { AddToReportResult } from "./BreachSection";
import { useMaster } from "./providers/MasterProvider";
import { useAudit } from "./providers/AuditProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function toDate(str: string): Date {
	const [y, m, d] = str.split("-").map(Number);
	return new Date(y, (m || 1) - 1, d || 1);
}
const breachKey = (b: Pick<BreachRecord, "code" | "kind">) => `${b.code}-${b.kind}`;

export default function SettlementAuditor() {
	const { master } = useMaster();
	const {
		reportDate,
		setReportDate,
		htmlFile,
		txtFile,
		frame,
		txt,
		htmlError,
		txtError,
		armed,
		setArmed,
		breachEdits,
		setBreachEdits,
		onHtml,
		onTxt,
	} = useAudit();

	const result = useMemo(() => {
		if (!armed || !frame || !txt || !txtFile || !reportDate) return null;
		const rd = toDate(reportDate);
		const filenameCheck = validateTxtFilename(txtFile.name, rd);
		return reconcile({
			frame,
			txt,
			master,
			reportDate: rd,
			filenameCheck,
			htmlFileName: htmlFile?.name,
		});
	}, [armed, frame, txt, txtFile, htmlFile, reportDate, master]);

	const breaches = useMemo<BreachRecord[]>(() => {
		if (!result) return [];
		return result.breaches.map((b) => ({
			...b,
			...breachEdits[breachKey(b)],
		}));
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
		parts.push(txt.format.valid ? "format ✓" : `format ⚠ (${txt.format.issues.length})`);
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

	// One-time cleanup: earlier builds parked breach rows in localStorage. The flow
	// is server-side now, so purge any leftover buffers so nothing goes stale.
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			for (let i = window.localStorage.length - 1; i >= 0; i--) {
				const k = window.localStorage.key(i);
				if (k && k.startsWith("nibbs:breach-buffer:")) window.localStorage.removeItem(k);
			}
		} catch {
			/* ignore */
		}
	}, []);

	// Push the breached banks onto the day's daily report. The server creates that
	// day's report if the analyst has none yet, otherwise appends to it.
	const addBreachesToDailyReport = async (): Promise<AddToReportResult> => {
		const label = result?.session.label;
		if (!label) return { error: "No settlement session resolved." };
		try {
			const res = await fetch("/api/schedule-reports/nibbs-breaches", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					date: reportDate,
					session: label,
					breaches: breaches.map((b) => ({ code: b.code, name: b.name })),
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data.ok) {
				return { error: data.error ?? "Couldn't add to the daily report." };
			}
			return { reportId: data.reportId, added: data.added, created: data.created };
		} catch {
			return { error: "Network error. Try again." };
		}
	};

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={Receipt}
				eyebrow="Report"
				title="Settlement Audit"
				description="Drop the settlement HTML and eTranzact file — the app runs every NIBBS_CHECKER validation and flags breaches for escalation."
				actions={
					<label className="flex flex-col rounded-lg border border-input bg-card px-3 py-1.5">
						<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							Report date
						</span>
						<Input
							type="date"
							value={reportDate}
							onChange={(e) => setReportDate(e.target.value)}
							className="h-auto border-none bg-transparent p-0 text-sm font-semibold shadow-none outline-none focus-visible:ring-0"
						/>
					</label>
				}
			/>

			<div className="space-y-6">
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
					<Button size="lg" onClick={() => setArmed(true)} disabled={!canRun}>
						<Play className="size-4" />
						Run audit
					</Button>
					{result && (
						<Button size="lg" variant="outline" onClick={() => downloadExcel(result, breaches, toDate(reportDate))}>
							<Download className="size-4" />
							Download Excel
						</Button>
					)}
					{result && (
						<Badge
							className={cn(
								"ml-auto gap-1.5 px-3 py-1.5 text-xs font-bold",
								result.hasFailures
									? "bg-destructive/15 text-destructive"
									: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
							)}
						>
							{result.hasFailures ? <TriangleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
							{result.hasFailures ? "AUDIT FAILED — see flags" : "ALL CHECKS PASSED"}
						</Badge>
					)}
				</section>

				{/* Results */}
				{result && (
					<>
						<section className="space-y-3">
							<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
								Validation checks
							</h2>
							<CheckSummary checks={result.checks} />
						</section>

						{result.formatIssues.length > 0 && (
							<Card className="print-block gap-0 overflow-hidden border-destructive/30 py-0">
								<div className="border-b border-destructive/20 bg-destructive/5 px-5 py-3">
									<h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
										<AlertTriangle className="size-4" />
										Format deviations — eTranzact file
									</h2>
									<p className="text-xs text-muted-foreground">
										{result.formatIssues.length} line(s) do not match the required template. Fix the file and
										re-upload before sending to NIBBS.
									</p>
								</div>
								<div className="max-h-72 overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm">
											<TableRow className="hover:bg-transparent">
												<TableHead>Line</TableHead>
												<TableHead>Problem</TableHead>
												<TableHead>Content</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{result.formatIssues.map((issue) => (
												<TableRow key={issue.line}>
													<TableCell className="tnum font-semibold text-destructive">{issue.line}</TableCell>
													<TableCell className="text-foreground">{issue.message}</TableCell>
													<TableCell className="tnum text-xs text-muted-foreground">
														{issue.content || <span className="italic">(empty)</span>}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</Card>
						)}

						<section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<Stat label="Frame net sum" value={formatNaira(result.totals.frameNetSum)} />
							<Stat label="Smartdet sum" value={formatNaira(result.totals.smartdetSum)} />
							<Stat label="Banks reconciled" value={String(result.rows.length)} />
							<Stat label="Breaches" value={String(breaches.length)} danger={breaches.length > 0} />
						</section>

						<ReconciliationTable rows={result.rows} />
						<BreachSection
							breaches={breaches}
							reportDate={toDate(reportDate)}
							onChange={updateBreach}
							sessionLabel={result.session.label ? sessionRowLabel(result.session.label) : undefined}
							canAddToReport={!!result.session.label}
							addHint={result.session.error}
							onAddToReport={addBreachesToDailyReport}
						/>
					</>
				)}

				{!result && (
					<Card className="border-dashed bg-muted/20 p-10 text-center shadow-none">
						<p className="text-sm text-muted-foreground">
							Upload both files and click <span className="font-semibold text-foreground">Run audit</span> to
							see the reconciliation and breach report.
						</p>
					</Card>
				)}

				<p className="text-center text-xs text-muted-foreground">
					All processing happens locally in your browser — settlement data never leaves this machine.
				</p>
			</div>
		</div>
	);
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
	return (
		<Card className="print-block gap-1 p-4">
			<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className={cn("tnum text-lg font-bold", danger ? "text-destructive" : "text-foreground")}>{value}</p>
		</Card>
	);
}
