"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, ClipboardList, Copy, FileText, Moon, Plus, Search, Sunrise, Sunset, X } from "lucide-react";
import { HANDOVER_TYPES, type HandoverType, type ScheduleReportListItem } from "@/lib/schedule/template";
import { filterReports, groupByMonth, splitOfficers } from "@/lib/schedule/listView";
import PageHeader from "../layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TYPE_STYLE: Record<HandoverType, { icon: typeof Moon; cls: string; short: string }> = {
	"Morning to Afternoon": { icon: Sunrise, cls: "bg-warning/10 text-warning", short: "Morning → Afternoon" },
	"Afternoon to Night": { icon: Sunset, cls: "bg-primary/10 text-primary", short: "Afternoon → Night" },
	"Night to Morning": { icon: Moon, cls: "bg-brand-violet/10 text-brand-violet", short: "Night → Morning" },
};

function typeStyle(type: string) {
	return TYPE_STYLE[type as HandoverType] ?? { icon: ClipboardList, cls: "bg-muted text-muted-foreground", short: type };
}

function initials(name: string): string {
	const parts = name.split(/\s+/).filter(Boolean);
	return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Officers({ raw, label }: { raw: string; label: string }) {
	const names = splitOfficers(raw);
	if (names.length === 0) return <span className="text-xs italic text-muted-foreground">No {label.toLowerCase()} officer</span>;
	return (
		<div className="flex min-w-0 items-center gap-2" title={`${label}: ${names.join(", ")}`}>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
				{initials(names[0])}
			</span>
			<span className="truncate text-sm text-foreground">
				{names[0]}
				{names.length > 1 && <span className="text-muted-foreground"> +{names.length - 1}</span>}
			</span>
		</div>
	);
}

function ReportRow({ report }: { report: ScheduleReportListItem }) {
	const [y, m, d] = report.reportDate.slice(0, 10).split("-").map(Number);
	const date = new Date(y, (m || 1) - 1, d || 1);
	const t = typeStyle(report.handoverType);
	return (
		<li>
			<Link
				href={`/daily-reports/${report.id}`}
				className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[auto_12rem_minmax(0,1fr)_auto]"
			>
				<div className="flex w-12 flex-col items-center leading-tight">
					<span className="tnum text-lg font-bold text-foreground">{String(d).padStart(2, "0")}</span>
					<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						{date.toLocaleDateString("en-GB", { weekday: "short" })}
					</span>
				</div>
				<span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", t.cls)}>
					<t.icon className="size-3.5" />
					{t.short}
				</span>
				<div className="col-span-3 row-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:col-span-1 md:row-start-auto">
					<Officers raw={report.outgoingOfficers} label="Outgoing" />
					<ArrowRight className="size-3.5 text-muted-foreground" aria-label="hands over to" />
					<Officers raw={report.incomingOfficers} label="Incoming" />
				</div>
				<ChevronRight className="col-start-3 row-start-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary md:col-start-auto md:row-start-auto" />
			</Link>
		</li>
	);
}

/** Browse saved daily schedule reports; search, filter by shift, start a new one or duplicate the last. */
export default function ScheduleReportList({ initialReports }: { initialReports: ScheduleReportListItem[] }) {
	const reports = initialReports;
	const [query, setQuery] = useState("");
	const [type, setType] = useState<HandoverType | null>(null);

	const shown = useMemo(() => filterReports(reports, { query, type }), [reports, query, type]);
	const groups = useMemo(() => groupByMonth(shown), [shown]);
	const filtering = query.trim() !== "" || type !== null;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={ClipboardList}
				eyebrow="Operations"
				title="Daily Schedule"
				description="Frauddesk shift-handover reports. Start from the standard template or carry the last shift forward, then export to Excel or send."
				actions={
					<>
						<Button
							variant="outline"
							className={cn(reports.length === 0 && "pointer-events-none opacity-40")}
							render={<Link href="/daily-reports/new?duplicate=latest" aria-disabled={reports.length === 0} />}
						>
							<Copy className="size-4" />
							Duplicate last shift
						</Button>
						<Button render={<Link href="/daily-reports/new" />}>
							<Plus className="size-4" />
							New report
						</Button>
					</>
				}
			/>

			{reports.length === 0 ? (
				<Card className="items-center border-dashed py-16 text-center shadow-none">
					<div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<FileText className="size-6" />
					</div>
					<p className="mt-3 text-sm font-semibold text-foreground">No handover reports yet</p>
					<p className="mt-1 text-sm text-muted-foreground">Create the first one from the standard template.</p>
					<Button className="mt-4" render={<Link href="/daily-reports/new" />}>
						<Plus className="size-4" />
						New report
					</Button>
				</Card>
			) : (
				<Card className="gap-0 overflow-hidden py-0">
					<div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
						<div className="relative min-w-56 flex-1 sm:max-w-sm">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search officers or dates"
								aria-label="Search reports"
								className="pl-8"
							/>
						</div>
						<div role="tablist" aria-label="Handover type" className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
							{[null, ...HANDOVER_TYPES].map((value) => {
								const active = type === value;
								return (
									<button
										key={value ?? "all"}
										type="button"
										role="tab"
										aria-selected={active}
										onClick={() => setType(value)}
										className={cn(
											"rounded-md px-3 py-1 text-xs font-medium transition-colors",
											active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
										)}
									>
										{value ? typeStyle(value).short : "All shifts"}
									</button>
								);
							})}
						</div>
						<p className="tnum ml-auto text-xs text-muted-foreground">
							{filtering ? `${shown.length} of ${reports.length} reports` : `${reports.length} reports`}
						</p>
					</div>

					{groups.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-14 text-center">
							<p className="text-sm text-muted-foreground">No reports match these filters.</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setQuery("");
									setType(null);
								}}
							>
								<X className="size-3.5" />
								Clear filters
							</Button>
						</div>
					) : (
						groups.map((g) => (
							<section key={g.key} aria-label={g.label}>
								<div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
									<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
									<span className="tnum text-xs text-muted-foreground">{g.reports.length}</span>
								</div>
								<ul className="divide-y divide-border border-b border-border last:border-b-0">
									{g.reports.map((r) => (
										<ReportRow key={r.id} report={r} />
									))}
								</ul>
							</section>
						))
					)}
				</Card>
			)}
		</div>
	);
}
