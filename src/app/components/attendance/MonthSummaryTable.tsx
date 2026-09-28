"use client";

import { formatDuration } from "@/lib/attendance/nightWindow";
import { personName, totalsOf } from "@/lib/attendance/summary";
import type { PersonMonthSummary } from "@/lib/attendance/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

	return (
		<div className="overflow-x-auto">
			<Table className="min-w-[560px]">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="text-[11px] uppercase tracking-wide">Analyst</TableHead>
						{showEmail && <TableHead className="text-[11px] uppercase tracking-wide">Email</TableHead>}
						<TableHead className="text-right text-[11px] uppercase tracking-wide">Nights</TableHead>
						<TableHead className="text-right text-[11px] uppercase tracking-wide">Signed out</TableHead>
						<TableHead className="text-right text-[11px] uppercase tracking-wide">Still open</TableHead>
						<TableHead className="text-right text-[11px] uppercase tracking-wide">Total hours</TableHead>
						<TableHead className="text-right text-[11px] uppercase tracking-wide">Avg / night</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{summaries.map((s) => (
						<TableRow key={s.person.id}>
							<TableCell className="font-medium text-foreground">{personName(s.person)}</TableCell>
							{showEmail && <TableCell className="text-muted-foreground">{s.person.email}</TableCell>}
							<TableCell className="tnum text-right font-semibold text-foreground">{s.nights}</TableCell>
							<TableCell className="tnum text-right text-muted-foreground">{s.completeNights}</TableCell>
							<TableCell
								className={cn(
									"tnum text-right",
									s.openNights > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
								)}
							>
								{s.openNights}
							</TableCell>
							<TableCell className="tnum text-right text-foreground">{formatDuration(s.totalMinutes)}</TableCell>
							<TableCell className="tnum text-right text-muted-foreground">
								{formatDuration(s.averageMinutes)}
							</TableCell>
						</TableRow>
					))}

					{summaries.length === 0 && (
						<TableRow className="hover:bg-transparent">
							<TableCell colSpan={showEmail ? 7 : 6} className="text-center text-muted-foreground">
								No analysts to show.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
				<TableFooter className="bg-primary/5">
					<TableRow className="hover:bg-transparent">
						<TableCell className="font-bold text-foreground">TOTAL</TableCell>
						{showEmail && (
							<TableCell className="text-muted-foreground">
								{totals.active} of {totals.people} signed in
							</TableCell>
						)}
						<TableCell className="tnum text-right font-bold text-foreground">{totals.nights}</TableCell>
						<TableCell className="tnum text-right font-bold text-foreground">
							{totals.nights - totals.openNights}
						</TableCell>
						<TableCell className="tnum text-right font-bold text-foreground">{totals.openNights}</TableCell>
						<TableCell className="tnum text-right font-bold text-foreground">
							{formatDuration(totals.totalMinutes)}
						</TableCell>
						<TableCell />
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	);
}
