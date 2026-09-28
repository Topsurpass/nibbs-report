"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { groupLabel } from "@/lib/escalation/names";
import { formatAmount } from "@/lib/escalation/parseRows";
import type { BankGroup } from "@/lib/escalation/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface BankGroupTableProps {
	groups: BankGroup[];
	grandTotal: number;
	/** Code of the bank currently downloading, if any. */
	downloading: string | null;
	onDownload: (group: BankGroup) => void;
}

/**
 * The escalation worklist: one row per beneficiary bank, biggest exposure first,
 * each with its own download so a single bank can be re-sent without rebuilding
 * the whole set.
 */
export default function BankGroupTable({ groups, grandTotal, downloading, onDownload }: BankGroupTableProps) {
	const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

	return (
		<Card className="gap-0 overflow-hidden py-0">
			<Table className="min-w-[560px]">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="px-4 py-3 text-xs uppercase tracking-wide">Beneficiary bank</TableHead>
						<TableHead className="px-4 py-3 text-xs uppercase tracking-wide">Code</TableHead>
						<TableHead className="px-4 py-3 text-right text-xs uppercase tracking-wide">Txns</TableHead>
						<TableHead className="px-4 py-3 text-right text-xs uppercase tracking-wide">Total</TableHead>
						<TableHead className="px-4 py-3" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{groups.map((group) => (
						<TableRow key={group.code} className={cn(group.unmapped && "bg-amber-500/5 hover:bg-amber-500/10")}>
							<TableCell className="px-4 py-3 font-medium text-foreground">
								<span className="inline-flex items-center gap-1.5">
									{group.unmapped && <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />}
									{groupLabel(group)}
								</span>
							</TableCell>
							<TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{group.code}</TableCell>
							<TableCell className="tnum px-4 py-3 text-right text-foreground">
								{group.rows.length.toLocaleString()}
							</TableCell>
							<TableCell className="tnum px-4 py-3 text-right text-foreground">{formatAmount(group.total)}</TableCell>
							<TableCell className="px-4 py-3 text-right">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => onDownload(group)}
									disabled={downloading === group.code}
								>
									{downloading === group.code ? <Loader2 className="animate-spin" /> : null}
									{downloading === group.code ? "Building…" : ".xlsx"}
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
				<TableFooter>
					<TableRow className="hover:bg-transparent">
						<TableCell className="px-4 py-3 text-foreground">
							TOTAL ({groups.length} bank{groups.length === 1 ? "" : "s"})
						</TableCell>
						<TableCell className="px-4 py-3" />
						<TableCell className="tnum px-4 py-3 text-right text-foreground">{totalRows.toLocaleString()}</TableCell>
						<TableCell className="tnum px-4 py-3 text-right text-foreground">{formatAmount(grandTotal)}</TableCell>
						<TableCell className="px-4 py-3" />
					</TableRow>
				</TableFooter>
			</Table>
		</Card>
	);
}
