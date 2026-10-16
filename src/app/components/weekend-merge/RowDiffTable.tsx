"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diffSegments, MISMATCH_LABELS, visibleWhitespace, type RowDiff } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import StatusBadge from "./StatusBadge";

/** Settlement's row with the differing fields/separators highlighted. */
function Theirs({ row }: { row: RowDiff }) {
	if (row.theirs === null) return <span className="italic text-destructive">(missing from Settlement&rsquo;s file)</span>;
	// A row in the wrong position is correct content; highlighting fields would mislead.
	if (row.ok || row.kinds.includes("order")) return <>{visibleWhitespace(row.theirs)}</>;
	return (
		<>
			{diffSegments(row.ours, row.theirs).map((s, i) => (
				<span key={i} className={cn(s.changed && "rounded-sm bg-destructive/15 px-0.5 font-semibold text-destructive")}>
					{visibleWhitespace(s.text)}
				</span>
			))}
		</>
	);
}

function LineLabel({ children }: { children: string }) {
	return <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}

/** Row-by-row comparison of our merged file against Settlement's. ⇥ = tab, · = space. */
export default function RowDiffTable({ rows }: { rows: RowDiff[] }) {
	return (
		<div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
			<Table>
				<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-14">Row</TableHead>
						<TableHead className="w-36">Result</TableHead>
						<TableHead>Content</TableHead>
						<TableHead className="w-[28%]">What&rsquo;s different</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 && (
						<TableRow>
							<TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
								No rows to show.
							</TableCell>
						</TableRow>
					)}
					{rows.map((r) => (
						<TableRow key={r.row} className={cn("align-top", !r.ok && "bg-destructive/[0.03]")}>
							<TableCell className="tnum text-muted-foreground">{r.row}</TableCell>
							<TableCell>
								<StatusBadge
									status={r.ok ? "pass" : "fail"}
									label={r.ok ? "Match" : r.kinds.map((k) => MISMATCH_LABELS[k]).join(" + ")}
								/>
							</TableCell>
							<TableCell className="tnum text-xs">
								{r.ok ? (
									<span className="whitespace-pre text-foreground">{visibleWhitespace(r.theirs ?? "")}</span>
								) : (
									<div className="space-y-1">
										<div className="flex items-baseline">
											<LineLabel>Expected</LineLabel>
											<span className="whitespace-pre text-muted-foreground">
												{r.ours === null ? <span className="italic">(no such row)</span> : visibleWhitespace(r.ours)}
											</span>
										</div>
										<div className="flex items-baseline">
											<LineLabel>Settlement</LineLabel>
											<span className="whitespace-pre text-foreground">
												<Theirs row={r} />
											</span>
										</div>
									</div>
								)}
							</TableCell>
							<TableCell className="whitespace-normal text-xs leading-relaxed text-muted-foreground">
								{r.reasons.length ? (
									<ul className="space-y-0.5">
										{r.reasons.map((reason) => (
											<li key={reason}>{reason}</li>
										))}
									</ul>
								) : (
									"—"
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
