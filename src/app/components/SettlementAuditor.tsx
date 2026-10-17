"use client";

import { useEffect, useMemo } from "react";
import {
	AlertTriangle,
	CalendarDays,
	Download,
	FileCode2,
	FileText,
	GitCompareArrows,
	Receipt,
	RotateCcw,
	Scale,
	ShieldCheck,
} from "lucide-react";
import PageHeader from "./layout/PageHeader";
import CheckList from "./CheckList";
import ReconciliationTable from "./ReconciliationTable";
import BreachSection from "./BreachSection";
import AuditFileSlot, { type SlotFact, type SlotStatus } from "./settlement-audit/AuditFileSlot";
import AuditSummaryPanel from "./settlement-audit/AuditSummaryPanel";
import AuditVerdict from "./settlement-audit/AuditVerdict";
import { validateTxtFilename } from "@/lib/parseTxt";
import { reconcile, type BreachRecord } from "@/lib/reconcile";
import { downloadExcel } from "@/lib/exportReport";
import { formatNaira } from "@/lib/format";
import { resolveSession, sessionRowLabel } from "@/lib/session/nibbsSession";
import type { AddToReportResult } from "./BreachSection";
import { useMaster } from "./providers/MasterProvider";
import { useAudit } from "./providers/AuditProvider";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function toDate(str: string): Date {
	const [y, m, d] = str.split("-").map(Number);
	return new Date(y, (m || 1) - 1, d || 1);
}
const breachKey = (b: Pick<BreachRecord, "code" | "kind">) => `${b.code}-${b.kind}`;

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });

/** What the audit checks, shown before both files are in. */
const WHAT_WE_CHECK = [
	{ icon: Scale, title: "Totals", body: "Frame net sum is zero; Smartdet sum and bank coverage line up." },
	{ icon: FileText, title: "File format", body: "Filename, date, session and every record against the eTranzact template." },
	{ icon: GitCompareArrows, title: "Reconciliation", body: "Smartdet vs Frame per bank (Jive), and collateral C + H ≥ 0." },
];

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
		breachEdits,
		setBreachEdits,
		onHtml,
		onTxt,
		reset,
	} = useAudit();

	const result = useMemo(() => {
		// Runs as soon as both files parse; changing the date re-runs it.
		if (!frame || !txt || !txtFile || !reportDate) return null;
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
	}, [frame, txt, txtFile, htmlFile, reportDate, master]);

	const breaches = useMemo<BreachRecord[]>(() => {
		if (!result) return [];
		return result.breaches.map((b) => ({
			...b,
			...breachEdits[breachKey(b)],
		}));
	}, [result, breachEdits]);

	const hasAnyFile = !!htmlFile || !!txtFile;
	const filenameCheck = useMemo(
		() => (txtFile && reportDate ? validateTxtFilename(txtFile.name, toDate(reportDate)) : null),
		[txtFile, reportDate],
	);
	// Known from the file names alone, before the audit runs.
	const session = hasAnyFile ? resolveSession(htmlFile?.name, filenameCheck?.sequence) : null;

	const htmlSlot = useMemo((): { status: SlotStatus; facts: SlotFact[]; message?: string } => {
		if (!htmlFile) return { status: "empty", facts: [] };
		if (!frame) return { status: "error", facts: [], message: htmlError ?? "Couldn't read this file." };
		const balanced = Math.round(frame.netSum * 100) === 0;
		return {
			status: htmlError ? "error" : balanced ? "ok" : "warn",
			message: htmlError ?? (balanced ? undefined : "Net sum is not zero. The audit will flag it."),
			facts: [
				{ label: "Banks", value: String(frame.rows.length) },
				{ label: "Net sum", value: formatNaira(frame.netSum), tone: balanced ? "ok" : "error" },
				{ label: "Dropped", value: `${frame.droppedEmpty} empty · ${frame.droppedPocketMoni} PocketMoni` },
				{ label: "Batch", value: frame.batchId ?? frame.settlementPeriod ?? "—" },
			],
		};
	}, [htmlFile, frame, htmlError]);

	const txtSlot = useMemo((): { status: SlotStatus; facts: SlotFact[]; message?: string } => {
		if (!txtFile) return { status: "empty", facts: [] };
		if (!txt || txt.rows.length === 0) return { status: "error", facts: [], message: txtError ?? "Couldn't read this file." };
		const formatOk = txt.format.valid;
		const nameOk = filenameCheck?.ok ?? false;
		return {
			status: !formatOk ? "error" : nameOk ? "ok" : "warn",
			message: !formatOk ? txtError : nameOk ? undefined : filenameCheck?.reason,
			facts: [
				{ label: "Records", value: String(txt.rows.length) },
				{ label: "File date", value: txt.fileDates.join(", ") || "—" },
				{
					label: "Format",
					value: formatOk ? "Valid" : `${txt.format.issues.length} issue(s)`,
					tone: formatOk ? "ok" : "error",
				},
				{ label: "Filename", value: nameOk ? "Matches date" : "Check name", tone: nameOk ? "ok" : "warn" },
			],
		};
	}, [txtFile, txt, txtError, filenameCheck]);

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

	const failed = result ? result.checks.filter((c) => c.status === "fail").length : 0;
	const warnings = result ? result.checks.filter((c) => c.status === "warn").length : 0;
	const sessionText = session?.label ? sessionRowLabel(session.label) : undefined;
	const reportDay = reportDate ? WEEKDAY.format(toDate(reportDate)) : "";

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={Receipt}
				eyebrow="Settlement"
				title="Settlement Audit"
				description="Drop the Frame HTML and the eTranzact file. Every NIBBS_CHECKER validation runs automatically and breaches are flagged for escalation."
				actions={
					<>
						{hasAnyFile && (
							<Button variant="outline" onClick={reset}>
								<RotateCcw className="size-4" />
								Start over
							</Button>
						)}
						{result && (
							<Button onClick={() => downloadExcel(result, breaches, toDate(reportDate))}>
								<Download className="size-4" />
								Download Excel
							</Button>
						)}
					</>
				}
			/>

			<Card className="no-print">
				<CardHeader>
					<CardTitle>Settlement files</CardTitle>
					<CardDescription>The audit runs as soon as both files are in. Drop a new file on either card to replace it.</CardDescription>
					<CardAction>
						<div className="flex items-center gap-2">
							<Label htmlFor="report-date" className="flex items-center gap-1.5 text-muted-foreground">
								<CalendarDays className="size-4" />
								<span className="hidden sm:inline">Report date</span>
							</Label>
							<Input
								id="report-date"
								type="date"
								className="w-40"
								value={reportDate}
								onChange={(e) => setReportDate(e.target.value)}
							/>
						</div>
					</CardAction>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<AuditFileSlot
							icon={FileCode2}
							title="Frame settlement (HTML)"
							source="NET SETTLEMENT POSITION export from the settlement team"
							example="2026-07-22 B.html"
							accept=".html,.htm"
							fileName={htmlFile?.name ?? null}
							status={htmlSlot.status}
							facts={htmlSlot.facts}
							message={htmlSlot.message}
							onFile={onHtml}
						/>
						<AuditFileSlot
							icon={FileText}
							title="eTranzact file (Smartdet)"
							source="The .txt from the NIBBS portal"
							example="ETRANZACT_22072026_2.txt"
							accept=".txt"
							fileName={txtFile?.name ?? null}
							status={txtSlot.status}
							facts={txtSlot.facts}
							message={txtSlot.message}
							onFile={onTxt}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
						{reportDay && <span>{reportDay}</span>}
						{session && (
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
									session.label && session.match
										? "bg-primary/10 text-primary"
										: "bg-warning/15 text-warning",
								)}
							>
								{session.label ? `${sessionRowLabel(session.label)} session` : "Session unknown"}
								{!session.match && session.error && <span className="font-normal">· {session.error}</span>}
							</span>
						)}
						<span className="ml-auto flex items-center gap-1.5">
							<ShieldCheck className="size-3.5" />
							Processed in your browser. Settlement data never leaves this machine.
						</span>
					</div>
				</CardContent>
			</Card>

			{!result ? (
				<Card className="no-print border-dashed bg-muted/20 shadow-none">
					<CardContent className="space-y-4 py-2">
						<p className="text-sm font-medium text-foreground">
							{hasAnyFile ? "Add the other file to run the audit." : "Results appear here as soon as both files are in."}
						</p>
						<ul className="grid gap-4 sm:grid-cols-3">
							{WHAT_WE_CHECK.map((c) => (
								<li key={c.title} className="flex gap-3">
									<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
										<c.icon className="size-4" />
									</div>
									<div>
										<p className="text-sm font-semibold text-foreground">{c.title}</p>
										<p className="text-xs leading-relaxed text-muted-foreground">{c.body}</p>
									</div>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : (
				// One grid so narrow screens read verdict → summary → detail, while xl
				// keeps the summary in a sticky right column.
				<div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-[minmax(0,1fr)] items-start gap-6 duration-300 xl:grid-cols-[minmax(0,1fr)_20rem]">
					<AuditVerdict
						className="xl:col-start-1"
						failed={failed}
						warnings={warnings}
						breaches={breaches.length}
						session={sessionText}
					/>

					<AuditSummaryPanel
						className="xl:sticky xl:top-20 xl:col-start-2 xl:row-span-2 xl:row-start-1"
						onDownload={() => downloadExcel(result, breaches, toDate(reportDate))}
						stats={[
							{ label: "Report date", value: reportDate.replaceAll("-", "/") },
							{ label: "Session", value: sessionText ?? "Unknown", tone: sessionText ? undefined : "warning" },
							{
								label: "Frame net sum",
								value: formatNaira(result.totals.frameNetSum),
								tone: Math.round(result.totals.frameNetSum * 100) === 0 ? "success" : "danger",
							},
							{ label: "Smartdet sum", value: formatNaira(result.totals.smartdetSum) },
							{ label: "Banks reconciled", value: result.rows.length },
							{ label: "Breaches", value: breaches.length, tone: breaches.length > 0 ? "danger" : "success" },
						]}
					/>

					<div className="min-w-0 space-y-6 xl:col-start-1">
						<Card>
							<CardHeader>
								<CardTitle>Validation checks</CardTitle>
								<CardDescription>
									{result.checks.length - failed - warnings} of {result.checks.length} passed. Problems are listed first.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<CheckList checks={result.checks} problemsFirst />
							</CardContent>
						</Card>

					{result.formatIssues.length > 0 && (
						<Card className="print-block gap-0 overflow-hidden border-destructive/30 py-0">
							<div className="border-b border-destructive/20 bg-destructive/5 px-5 py-3">
								<h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
									<AlertTriangle className="size-4" />
									Format deviations in the eTranzact file
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
				</div>
			)}
		</div>
	);
}
