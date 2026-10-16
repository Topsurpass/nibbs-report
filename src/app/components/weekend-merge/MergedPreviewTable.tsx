"use client";

import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toSlashDate } from "@/lib/format";
import { weekdayName, type MergedRow } from "@/lib/weekendMerge";

/** Every merged row, grouped by the source file it came from. */
export default function MergedPreviewTable({ rows }: { rows: MergedRow[] }) {
	return (
		<Card className="gap-0 overflow-hidden py-0">
			<div className="max-h-[28rem] overflow-auto">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-14">Row</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Date</TableHead>
							<TableHead>Bank code</TableHead>
							<TableHead className="text-right">Amount</TableHead>
							<TableHead>Source line</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r, i) => {
							const [type, date] = r.line.split("\t");
							const first = i === 0 || rows[i - 1].sourceName !== r.sourceName;
							return (
								<Fragment key={r.row}>
									{first && (
										<TableRow className="bg-muted/40 hover:bg-muted/40">
											<TableCell colSpan={6} className="py-1.5 text-xs font-semibold text-muted-foreground">
												{weekdayName(r.sourceDate)} {toSlashDate(r.sourceDate)} · {r.sourceSessionLabel} · {r.sourceName}
											</TableCell>
										</TableRow>
									)}
									<TableRow>
										<TableCell className="tnum text-muted-foreground">{r.row}</TableCell>
										<TableCell className="tnum">{type}</TableCell>
										<TableCell className="tnum">{date}</TableCell>
										<TableCell className="tnum">{r.code}</TableCell>
										<TableCell className="tnum text-right">{r.amountStr}</TableCell>
										<TableCell className="tnum text-xs text-muted-foreground">line {r.sourceLine}</TableCell>
									</TableRow>
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</Card>
	);
}
