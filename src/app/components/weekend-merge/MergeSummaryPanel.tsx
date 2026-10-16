"use client";

import { AlertTriangle, CheckCircle2, Circle, Download, FileText, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { CheckResult, CheckStatus } from "@/lib/reconcile";
import { SESSION_LABELS } from "@/lib/session/nibbsSession";
import { formatKobo, ZERO, type MergeResult, type SessionNo } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";

const SESSION_ITEMS = Object.fromEntries(SESSION_LABELS.map((label, i) => [String(i + 1), `_${i + 1} · ${label}`]));

const CHECK_ICON: Record<CheckStatus, { icon: typeof CheckCircle2; cls: string }> = {
	pass: { icon: CheckCircle2, cls: "text-success" },
	warn: { icon: AlertTriangle, cls: "text-warning" },
	fail: { icon: XCircle, cls: "text-destructive" },
};

interface MergeSummaryPanelProps {
	merge: MergeResult | null;
	checks: CheckResult[];
	mergeDate: string;
	isDefaultDate: boolean;
	onMergeDateChange: (v: string | null) => void;
	session: SessionNo;
	onSessionChange: (v: SessionNo) => void;
	downloadable: boolean;
	onDownload: () => void;
	className?: string;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
	return (
		<div className="flex items-center justify-between gap-3 py-1">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd
				className={cn(
					"tnum text-sm font-semibold text-foreground",
					tone === "success" && "text-success",
					tone === "danger" && "text-destructive",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

/** The output: name, date, session, totals, readiness and the download action. */
export default function MergeSummaryPanel({
	merge,
	checks,
	mergeDate,
	isDefaultDate,
	onMergeDateChange,
	session,
	onSessionChange,
	downloadable,
	onDownload,
	className,
}: MergeSummaryPanelProps) {
	const blocking = checks.filter((c) => c.status === "fail").length;
	const rowDate = mergeDate ? mergeDate.replaceAll("-", "/") : "—";

	return (
		<Card className={cn("gap-4", className)}>
			<CardHeader>
				<CardTitle>Merged file</CardTitle>
				<CardDescription>The single file for the next business day</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<FileText className="size-4.5" />
					</div>
					<div className="min-w-0">
						<p className="tnum truncate text-sm font-semibold text-foreground">{merge?.fileName ?? "Not ready yet"}</p>
						<p className="text-[11px] text-muted-foreground">CRLF line endings · no trailing newline</p>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<div className="flex h-4 items-center justify-between">
							<Label htmlFor="merge-date">Merge date</Label>
							{!isDefaultDate && (
								<button
									type="button"
									onClick={() => onMergeDateChange(null)}
									className="flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
								>
									<RotateCcw className="size-3" />
									Reset
								</button>
							)}
						</div>
						<Input
							id="merge-date"
							type="date"
							value={mergeDate}
							onChange={(e) => onMergeDateChange(e.target.value || null)}
						/>
						<p className="text-[11px] text-muted-foreground">{isDefaultDate ? "Next business day" : "Custom date"}</p>
					</div>
					<div className="space-y-1.5">
						<div className="flex h-4 items-center">
							<Label htmlFor="merge-session">Session</Label>
						</div>
						<Select items={SESSION_ITEMS} value={String(session)} onValueChange={(v) => v && onSessionChange(Number(v) as SessionNo)}>
							<SelectTrigger id="merge-session" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(SESSION_ITEMS).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-[11px] text-muted-foreground">Default _1, morning</p>
					</div>
				</div>

				<Separator />

				<dl>
					<Stat label="Files merged" value={merge?.sources.length ?? 0} />
					<Stat label="Total rows" value={merge?.rows.length ?? 0} />
					<Stat
						label="Net total"
						value={merge ? formatKobo(merge.sumKobo) : "—"}
						tone={merge ? (merge.sumKobo === ZERO ? "success" : "danger") : undefined}
					/>
					<Stat label="Date on every row" value={rowDate} />
				</dl>

				<Separator />

				<div className="space-y-2">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Readiness</p>
					<ul className="space-y-1.5">
						{checks.length === 0 && (
							<li className="flex items-center gap-2 text-sm text-muted-foreground">
								<Circle className="size-4" />
								Waiting for files
							</li>
						)}
						{checks.map((c) => {
							const s = CHECK_ICON[c.status];
							return (
								<li key={c.id} className="flex items-start gap-2 text-sm" title={c.detail}>
									<s.icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} aria-label={c.status} />
									<span className={cn(c.status === "pass" ? "text-foreground" : s.cls)}>{c.label}</span>
								</li>
							);
						})}
					</ul>
				</div>

				<Button size="lg" className="w-full" onClick={onDownload} disabled={!downloadable}>
					<Download className="size-4" />
					Download merged file
				</Button>
				<p className="text-center text-[11px] text-muted-foreground">
					{downloadable
						? "Processed locally. Data never leaves this browser."
						: blocking > 0
							? `Fix ${blocking} problem${blocking === 1 ? "" : "s"} to enable download`
							: "Upload files to enable download"}
				</p>
			</CardContent>
		</Card>
	);
}
