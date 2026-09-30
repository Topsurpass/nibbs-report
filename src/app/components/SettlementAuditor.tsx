"use client";

import { useEffect, useMemo } from "react";
import { Play, Download, AlertTriangle, CheckCircle2, TriangleAlert, Receipt, CalendarDays, Landmark } from "lucide-react";
import PageHeader from "./layout/PageHeader";
import StatTile from "./layout/StatTile";
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
import { Label } from "@/components/ui/label";
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
			/>

			<div className="lg:flex lg:items-start lg:gap-6">
				{/* Workbench rail — inputs stay put while results scroll on the right */}
				<div className="no-print space-y-4 lg:sticky lg:top-20 lg:w-80 lg:shrink-0">
					<Card className="gap-3 p-4">
						<Label htmlFor="report-date" className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
							<CalendarDays className="size-3.5" />
							Report date
						</Label>
						<Input id="report-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
					</Card>

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

					<div className="flex flex-col gap-2">
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
									"w-full justify-center gap-1.5 py-2 text-xs font-bold",
									result.hasFailures
										? "bg-destructive/15 text-destructive"
										: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
								)}
							>
								{result.hasFailures ? <TriangleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
								{result.hasFailures ? "AUDIT FAILED — see flags" : "ALL CHECKS PASSED"}
							</Badge>
						)}
					</div>

					<p className="text-center text-xs text-muted-foreground">
						All processing happens locally in your browser — settlement data never leaves this machine.
					</p>
				</div>

				{/* Results */}
				<div className="mt-6 min-w-0 flex-1 space-y-6 lg:mt-0">
					{result ? (
						<div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-300">
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
											{result.formatIssues.length} line(s) do not match the required template. Fix the file
											and re-upload before sending to NIBBS.
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
														<TableCell className="tnum font-semibold text-destructive">
															{issue.line}
														</TableCell>
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
								<StatTile icon={Landmark} label="Frame net sum" value={formatNaira(result.totals.frameNetSum)} className="print-block" />
								<StatTile icon={Landmark} label="Smartdet sum" value={formatNaira(result.totals.smartdetSum)} className="print-block" />
								<StatTile icon={CheckCircle2} label="Banks reconciled" value={result.rows.length} className="print-block" />
								<StatTile
									icon={AlertTriangle}
									label="Breaches"
									value={breaches.length}
									tone={breaches.length > 0 ? "danger" : "success"}
									className="print-block"
								/>
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
						</div>
					) : (
						<Card className="flex min-h-[420px] flex-col items-center justify-center border-dashed bg-muted/20 p-10 text-center shadow-none">
							<div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<Receipt className="size-7" />
							</div>
							<p className="mt-4 max-w-sm text-sm text-muted-foreground">
								Upload both files on the left and click{" "}
								<span className="font-semibold text-foreground">Run audit</span> to see the reconciliation and
								breach report here.
							</p>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
}
