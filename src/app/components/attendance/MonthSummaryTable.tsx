"use client";

import { formatDuration } from "@/lib/attendance/nightWindow";
import { personName, totalsOf } from "@/lib/attendance/summary";
import type { PersonMonthSummary } from "@/lib/attendance/types";

/**
 * Nights and hours per analyst, with the same totals row the workbook and the
 * JPEG carry — all three read `summarizeMonth`, so they cannot disagree.
 *
 * Analysts with zero nights are still listed. A register that hides whoever
 * never signed in answers the wrong question.
 */

interface Props {
	summaries: PersonMonthSummary[];
	/** Hide the email column when the table is one person's own register. */
	showEmail: boolean;
}

export default function MonthSummaryTable({ summaries, showEmail }: Props) {
	const totals = totalsOf(summaries);
	const th = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted";
	const td = "px-3 py-2.5 text-sm";

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[560px] border-collapse">
				<thead>
					<tr className="border-b border-border">
						<th className={th}>Analyst</th>
						{showEmail && <th className={th}>Email</th>}
						<th className={`${th} text-right`}>Nights</th>
						<th className={`${th} text-right`}>Signed out</th>
						<th className={`${th} text-right`}>Still open</th>
						<th className={`${th} text-right`}>Total hours</th>
						<th className={`${th} text-right`}>Avg / night</th>
					</tr>
				</thead>
				<tbody>
					{summaries.map((s) => (
						<tr key={s.person.id} className="border-b border-border/60 last:border-0">
							<td className={`${td} font-medium text-foreground`}>{personName(s.person)}</td>
							{showEmail && <td className={`${td} text-muted`}>{s.person.email}</td>}
							<td className={`${td} text-right font-semibold tabular-nums text-foreground`}>
								{s.nights}
							</td>
							<td className={`${td} text-right tabular-nums text-muted`}>{s.completeNights}</td>
							<td
								className={`${td} text-right tabular-nums ${
									s.openNights > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted"
								}`}
							>
								{s.openNights}
							</td>
							<td className={`${td} text-right tabular-nums text-foreground`}>
								{formatDuration(s.totalMinutes)}
							</td>
							<td className={`${td} text-right tabular-nums text-muted`}>
								{formatDuration(s.averageMinutes)}
							</td>
						</tr>
					))}

					{summaries.length === 0 && (
						<tr>
							<td colSpan={showEmail ? 7 : 6} className={`${td} text-center text-muted`}>
								No analysts to show.
							</td>
						</tr>
					)}
				</tbody>
				<tfoot>
					<tr className="border-t-2 border-border bg-indigo-500/5">
						<td className={`${td} font-bold text-foreground`}>TOTAL</td>
						{showEmail && (
							<td className={`${td} text-muted`}>
								{totals.active} of {totals.people} signed in
							</td>
						)}
						<td className={`${td} text-right font-bold tabular-nums text-foreground`}>
							{totals.nights}
						</td>
						<td className={`${td} text-right font-bold tabular-nums text-foreground`}>
							{totals.nights - totals.openNights}
						</td>
						<td className={`${td} text-right font-bold tabular-nums text-foreground`}>
							{totals.openNights}
						</td>
						<td className={`${td} text-right font-bold tabular-nums text-foreground`}>
							{formatDuration(totals.totalMinutes)}
						</td>
						<td className={td} />
					</tr>
				</tfoot>
			</table>
		</div>
	);
}
