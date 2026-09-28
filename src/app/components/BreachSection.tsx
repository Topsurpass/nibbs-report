"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clipboard, ClipboardCheck, Download, Plus, ArrowRight } from "lucide-react";
import type { BreachRecord } from "@/lib/reconcile";
import { formatNaira } from "@/lib/format";
import { BREACH_COLUMNS, buildBreachClipboard, downloadBreachExcel } from "@/lib/exportReport";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Outcome of pushing breaches onto the daily report. */
export type AddToReportResult =
	| { reportId: string; added: number; created: boolean }
	| { error: string };

interface Props {
	breaches: BreachRecord[];
	reportDate: Date;
	onChange: (index: number, patch: Partial<BreachRecord>) => void;
	/** Resolved session label, e.g. "11am NIBBS" (undefined when unresolved). */
	sessionLabel?: string;
	/** Whether breaches can be pushed to the daily report (session resolved). */
	canAddToReport?: boolean;
	/** Tooltip explaining why the add is disabled. */
	addHint?: string;
	/** Create/append the day's daily report with these breaches. */
	onAddToReport?: () => Promise<AddToReportResult>;
}

const STATUS_OPTIONS = ["UNACCEPTABLE", "UNDER REVIEW", "ACCEPTED", "RESOLVED"];

export default function BreachSection({
	breaches,
	reportDate,
	onChange,
	sessionLabel,
	canAddToReport,
	addHint,
	onAddToReport,
}: Props) {
	const [copied, setCopied] = useState(false);
	const [adding, setAdding] = useState(false);
	const [added, setAdded] = useState<{ reportId: string; added: number; created: boolean } | null>(null);
	const [addError, setAddError] = useState<string | null>(null);

	const addToReport = async () => {
		if (!onAddToReport || adding) return;
		setAdding(true);
		setAddError(null);
		try {
			const res = await onAddToReport();
			if ("error" in res) {
				setAddError(res.error);
				setAdded(null);
			} else {
				setAdded(res);
			}
		} finally {
			setAdding(false);
		}
	};

	const copyTable = async () => {
		const { html, tsv } = buildBreachClipboard(breaches);
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([tsv], { type: "text/plain" }),
				}),
			]);
		} catch {
			try {
				await navigator.clipboard.writeText(tsv);
			} catch {
				/* clipboard unavailable */
			}
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1800);
	};

	if (breaches.length === 0) {
		return (
			<Card className="print-block border-emerald-500/25 bg-emerald-500/5 py-8 text-center ring-1 ring-inset ring-emerald-500/20">
				<CheckCircle2 className="mx-auto size-7 text-emerald-600 dark:text-emerald-400" />
				<p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
					No breaches — nothing to escalate
				</p>
				<p className="text-xs text-muted-foreground">All banks reconcile and collateral coverage is intact.</p>
			</Card>
		);
	}

	const cellBase = "border border-border px-3 py-2 text-sm align-middle";

	return (
		<Card className="print-block gap-0 overflow-hidden border-destructive/30 py-0">
			{/* Toolbar */}
			<CardHeader className="no-print flex-row flex-wrap items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 py-4">
				<div>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="size-4" />
						Breached Section for Escalation
					</CardTitle>
					<CardDescription>
						{breaches.length} item(s) · edit Status/Reason, then copy straight into your reply
					</CardDescription>
				</div>
				<div className="row-start-2 flex flex-wrap items-center gap-2 self-center sm:row-start-1">
					{onAddToReport && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addToReport}
							disabled={!canAddToReport || adding}
							title={canAddToReport ? undefined : addHint}
							className="border-destructive/40 text-destructive hover:bg-destructive/10"
						>
							<Plus className="size-4" />
							{adding ? "Adding…" : `Add to daily report${sessionLabel ? ` · ${sessionLabel}` : ""}`}
						</Button>
					)}
					<Button type="button" size="sm" onClick={copyTable} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
						{copied ? <ClipboardCheck className="size-4" /> : <Clipboard className="size-4" />}
						{copied ? "Copied" : "Copy table"}
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => downloadBreachExcel(breaches, reportDate)}>
						<Download className="size-4" />
						Excel
					</Button>
				</div>
			</CardHeader>

			{(added || addError) && (
				<div className="no-print px-5 pt-3 text-sm">
					{addError && <span className="text-destructive">{addError}</span>}
					{added && (
						<span className="text-emerald-700 dark:text-emerald-300">
							{added.added > 0
								? `Added ${added.added} row${added.added === 1 ? "" : "s"} to the ${
										added.created ? "new " : ""
									}${reportDate.toLocaleDateString("en-GB")} daily report`
								: `Already on the ${reportDate.toLocaleDateString("en-GB")} daily report`}{" "}
							<Link
								href={`/daily-reports/${added.reportId}`}
								className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:no-underline"
							>
								Open report <ArrowRight className="size-3" />
							</Link>
						</span>
					)}
				</div>
			)}

			<p className="no-print px-5 pt-3 text-[11px] text-muted-foreground">
				Tip: &ldquo;Copy table&rdquo; copies a formatted grid — paste it directly into an Outlook/Gmail reply or a
				new Excel sheet.
			</p>

			{/* Excel-style grid */}
			<div className="overflow-x-auto p-4">
				<table className="w-full min-w-[820px] border-collapse">
					<thead>
						<tr className="bg-amber-300/80 text-slate-900 dark:bg-amber-400/80">
							{BREACH_COLUMNS.map((c) => (
								<th key={c} className="border border-border px-3 py-2 text-left text-xs font-bold uppercase tracking-wide">
									{c}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{breaches.map((b, i) => (
							<tr key={`${b.code}-${b.kind}`} className="odd:bg-muted/30">
								<td className={cellBase}>
									<div className="font-medium text-foreground">{b.name}</div>
									<div className="tnum text-[11px] text-muted-foreground">{b.code}</div>
								</td>
								<td className={cn(cellBase, "tnum text-right text-foreground")}>
									{formatNaira(b.netSettlementPosition)}
								</td>
								<td className={cn(cellBase, "tnum text-right text-foreground")}>
									{b.collateral === null ? "—" : formatNaira(b.collateral)}
								</td>
								<td className={cn(cellBase, "tnum text-right font-semibold text-destructive")}>
									{formatNaira(b.variance)}
								</td>
								<td className={cn(cellBase, "p-0")}>
									<select
										value={b.status}
										onChange={(e) => onChange(i, { status: e.target.value })}
										className="w-full bg-transparent px-3 py-2 text-sm font-medium text-foreground outline-none focus:bg-primary/5"
									>
										{STATUS_OPTIONS.map((o) => (
											<option key={o} value={o}>
												{o}
											</option>
										))}
									</select>
								</td>
								<td className={cn(cellBase, "p-0")}>
									<input
										type="text"
										value={b.reason}
										onChange={(e) => onChange(i, { reason: e.target.value })}
										className="w-full min-w-[180px] bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:bg-primary/5"
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
}
