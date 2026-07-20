"use client";

import Link from "next/link";
import type { ScheduleReportListItem } from "@/lib/schedule/template";

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
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
						Reports
					</p>
					<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
						Daily Schedule Reports
					</h1>
					<p className="mt-2 max-w-2xl text-sm text-white/80">
						Frauddesk shift-handover reports. Create a new one from the standard template or
						carry the last shift forward, then export to Excel.
					</p>
				</div>
			</header>

			<div className="space-y-4 px-6 py-8 sm:px-10">
				<div className="flex flex-wrap items-center gap-2">
					<Link
						href="/daily-reports/new"
						className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
					>
						+ New report
					</Link>
					<Link
						href="/daily-reports/new?duplicate=latest"
						aria-disabled={reports.length === 0}
						className={`rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5 ${
							reports.length === 0 ? "pointer-events-none opacity-40" : ""
						}`}
					>
						Duplicate last shift
					</Link>
				</div>

				<div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
					{reports.length === 0 ? (
						<p className="px-5 py-10 text-center text-sm text-muted">
							No reports yet. Click <span className="font-semibold">New report</span> to create the
							first one.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
										<th className="px-5 py-3 font-semibold">Date</th>
										<th className="px-5 py-3 font-semibold">Handover</th>
										<th className="px-5 py-3 font-semibold">Outgoing</th>
										<th className="px-5 py-3 font-semibold">Incoming</th>
										<th className="px-5 py-3"></th>
									</tr>
								</thead>
								<tbody>
									{reports.map((r) => (
										<tr key={r.id} className="border-t border-border hover:bg-black/5 dark:hover:bg-white/5">
											<td className="px-5 py-3 font-medium text-foreground">{fmtDate(r.reportDate)}</td>
											<td className="px-5 py-3 text-muted">{r.handoverType}</td>
											<td className="px-5 py-3 text-muted">{r.outgoingOfficers || "—"}</td>
											<td className="px-5 py-3 text-muted">{r.incomingOfficers || "—"}</td>
											<td className="px-5 py-3 text-right">
												<Link
													href={`/daily-reports/${r.id}`}
													className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
												>
													Open
												</Link>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
