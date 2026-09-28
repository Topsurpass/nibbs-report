"use client";

import Link from "next/link";
import { Plus, Copy, ArrowRight, FileText } from "lucide-react";
import type { ScheduleReportListItem } from "@/lib/schedule/template";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Browse saved daily schedule reports; start a new one or duplicate the last. */
export default function ScheduleReportList({
	initialReports,
}: {
	initialReports: ScheduleReportListItem[];
}) {
	const reports = initialReports;

	const fmtDate = (iso: string) => {
		const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
		return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
	};

	return (
		<div>
			<header className="hero-gradient text-white">
				<div className="px-6 py-9 sm:px-10">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Reports</p>
					<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Daily Schedule Reports</h1>
					<p className="mt-2 max-w-2xl text-sm text-white/80">
						Frauddesk shift-handover reports. Create a new one from the standard template or carry the last
						shift forward, then export to Excel.
					</p>
				</div>
			</header>

			<div className="space-y-4 px-6 py-8 sm:px-10">
				<div className="flex flex-wrap items-center gap-2">
					<Button size="lg" render={<Link href="/daily-reports/new" />}>
						<Plus className="size-4" />
						New report
					</Button>
					<Button
						variant="outline"
						size="lg"
						className={cn(reports.length === 0 && "pointer-events-none opacity-40")}
						render={<Link href="/daily-reports/new?duplicate=latest" aria-disabled={reports.length === 0} />}
					>
						<Copy className="size-4" />
						Duplicate last shift
					</Button>
				</div>

				<Card className="gap-0 overflow-hidden py-0">
					{reports.length === 0 ? (
						<div className="px-5 py-14 text-center">
							<FileText className="mx-auto size-8 text-muted-foreground/50" />
							<p className="mt-3 text-sm text-muted-foreground">
								No reports yet. Click <span className="font-semibold text-foreground">New report</span> to
								create the first one.
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Date</TableHead>
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Handover</TableHead>
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Outgoing</TableHead>
									<TableHead className="px-5 py-3 text-[11px] uppercase tracking-wide">Incoming</TableHead>
									<TableHead className="px-5 py-3" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{reports.map((r) => (
									<TableRow key={r.id}>
										<TableCell className="px-5 py-3 font-medium text-foreground">
											{fmtDate(r.reportDate)}
										</TableCell>
										<TableCell className="px-5 py-3 text-muted-foreground">{r.handoverType}</TableCell>
										<TableCell className="px-5 py-3 text-muted-foreground">
											{r.outgoingOfficers || "—"}
										</TableCell>
										<TableCell className="px-5 py-3 text-muted-foreground">
											{r.incomingOfficers || "—"}
										</TableCell>
										<TableCell className="px-5 py-3 text-right">
											<Button variant="outline" size="sm" render={<Link href={`/daily-reports/${r.id}`} />}>
												Open
												<ArrowRight className="size-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</Card>
			</div>
		</div>
	);
}
