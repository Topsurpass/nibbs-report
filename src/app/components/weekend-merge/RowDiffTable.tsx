"use client";

import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MISMATCH_LABELS, visibleWhitespace, type RowDiff } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import StatusBadge from "./StatusBadge";

function Line({ text }: { text: string | null }) {
	if (text === null) return <span className="italic text-muted-foreground">(no row)</span>;
	return <span className="tnum whitespace-pre text-xs">{visibleWhitespace(text)}</span>;
}

/** Row-by-row comparison of our merged file against Settlement's. ⇥ = tab, · = space. */
export default function RowDiffTable({ rows }: { rows: RowDiff[] }) {
	return (
		<Card className="gap-0 overflow-hidden py-0">
			<div className="max-h-[32rem] overflow-auto">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-14">Row</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Ours</TableHead>
							<TableHead>Settlement&rsquo;s</TableHead>
							<TableHead>Why</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 && (
							<TableRow>
								<TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
									No rows to show.
								</TableCell>
							</TableRow>
						)}
						{rows.map((r) => (
							<TableRow key={r.row} className={cn(!r.ok && "bg-destructive/5")}>
								<TableCell className="tnum text-muted-foreground">{r.row}</TableCell>
								<TableCell>
									<StatusBadge
										status={r.ok ? "pass" : "fail"}
										label={r.ok ? "Match" : r.kinds.map((k) => MISMATCH_LABELS[k]).join(" + ")}
									/>
								</TableCell>
								<TableCell>
									<Line text={r.ours} />
								</TableCell>
								<TableCell>
									<Line text={r.theirs} />
								</TableCell>
								<TableCell className="max-w-md whitespace-normal text-xs text-destructive">
									{r.reasons.join("; ")}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</Card>
	);
}
