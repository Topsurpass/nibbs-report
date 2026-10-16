"use client";

import { Fragment } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toSlashDate } from "@/lib/format";
import { formatKobo, weekdayName, type SourceFile } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import StatusBadge, { type RowStatus } from "./StatusBadge";

interface SourceFileTableProps {
	/** Sources already in merge order. */
	sources: SourceFile[];
	onRemove: (id: string) => void;
}

function dayOf(f: SourceFile): string {
	return f.date ? `${weekdayName(f.date)} ${toSlashDate(f.date)}` : "Not merged: invalid name";
}

function fileStatus(f: SourceFile): RowStatus {
	if (!f.valid) return "fail";
	return f.issues.length > 0 ? "warn" : "pass";
}

/** The uploaded files in the order they will be merged, with every upload check. */
export default function SourceFileTable({ sources, onRemove }: SourceFileTableProps) {
	// Position in the merged file for mergeable files; derived up front so render stays pure.
	const mergeable = sources.filter((f) => f.valid && f.date);
	return (
		<Card className="gap-0 overflow-hidden py-0">
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-12">#</TableHead>
							<TableHead>File</TableHead>
							<TableHead>Session</TableHead>
							<TableHead className="text-right">Rows</TableHead>
							<TableHead className="text-right">Net</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Checks</TableHead>
							<TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sources.map((f, i) => {
							const status = fileStatus(f);
							const day = dayOf(f);
							const showDay = i === 0 || dayOf(sources[i - 1]) !== day;
							const mergeNo = mergeable.indexOf(f) + 1;
							return (
								<Fragment key={f.id}>
									{showDay && (
										<TableRow className="bg-muted/40 hover:bg-muted/40">
											<TableCell colSpan={8} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												{day}
											</TableCell>
										</TableRow>
									)}
									<TableRow className={cn(status === "fail" && "bg-destructive/5")}>
										<TableCell className="tnum text-muted-foreground">{mergeNo > 0 ? mergeNo : "—"}</TableCell>
										<TableCell className="tnum max-w-64 truncate font-medium" title={f.name}>
											{f.name}
										</TableCell>
										<TableCell>{f.sessionLabel ? `_${f.session} · ${f.sessionLabel}` : "—"}</TableCell>
										<TableCell className="tnum text-right">{f.records.length}</TableCell>
										<TableCell className="tnum text-right">{formatKobo(f.sumKobo)}</TableCell>
										<TableCell>
											<StatusBadge status={status} />
										</TableCell>
										<TableCell className="max-w-md whitespace-normal text-xs">
											{f.issues.length === 0 ? (
												<span className="text-muted-foreground">Name, template, dates, CRLF, net = 0</span>
											) : (
												<ul className="space-y-0.5">
													{f.issues.map((i) => (
														<li key={i.message} className={i.severity === "fail" ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
															{i.message}
														</li>
													))}
												</ul>
											)}
										</TableCell>
										<TableCell>
											<Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)}>
												<X className="size-4" />
											</Button>
										</TableCell>
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
