"use client";

import Link from "next/link";
import { Plus, Copy, ArrowUpRight, FileText, ClipboardList, Users, UserCheck } from "lucide-react";
import type { ScheduleReportListItem } from "@/lib/schedule/template";
import PageHeader from "../layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const fmtDate = (iso: string) => {
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return { day: "—", month: iso };
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return {
		day: d.toLocaleDateString("en-GB", { day: "2-digit" }),
		month: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
	};
};

function ReportCard({ report, index }: { report: ScheduleReportListItem; index: number }) {
	const { day, month } = fmtDate(report.reportDate);
	return (
		<Link
			href={`/daily-reports/${report.id}`}
			className="group animate-in fade-in slide-in-from-bottom-1"
			style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: "backwards" }}
		>
			<Card className="h-full gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/20">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 leading-none text-primary">
							<span className="tnum text-base font-bold">{day}</span>
							<span className="text-[9px] font-medium uppercase tracking-wide">{month.split(" ")[0]}</span>
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold text-foreground">{month}</p>
							<Badge variant="secondary" className="mt-1">
								{report.handoverType}
							</Badge>
						</div>
					</div>
					<ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
				</div>

				<div className="space-y-1.5 border-t border-border pt-3 text-xs">
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Users className="size-3.5 shrink-0" />
						<span className="truncate">Outgoing: {report.outgoingOfficers || "—"}</span>
					</div>
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<UserCheck className="size-3.5 shrink-0" />
						<span className="truncate">Incoming: {report.incomingOfficers || "—"}</span>
					</div>
				</div>
			</Card>
		</Link>
	);
}

/** Browse saved daily schedule reports; start a new one or duplicate the last. */
export default function ScheduleReportList({
	initialReports,
}: {
	initialReports: ScheduleReportListItem[];
}) {
	const reports = initialReports;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={ClipboardList}
				eyebrow="Reports"
				title="Daily Schedule Reports"
				description="Frauddesk shift-handover reports. Create a new one from the standard template or carry the last shift forward, then export to Excel."
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
				<Card className="border-dashed py-16 text-center shadow-none">
					<FileText className="mx-auto size-8 text-muted-foreground/50" />
					<p className="mt-3 text-sm text-muted-foreground">
						No reports yet. Click <span className="font-semibold text-foreground">New report</span> to create
						the first one.
					</p>
				</Card>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{reports.map((r, i) => (
						<ReportCard key={r.id} report={r} index={i} />
					))}
				</div>
			)}
		</div>
	);
}
