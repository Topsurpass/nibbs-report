"use client";

import { useState } from "react";
import { CheckCircle2, GitMerge } from "lucide-react";
import type { ReconRow } from "@/lib/reconcile";
import { formatNaira } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Filter = "all" | "breaches";

function Amount({ value, breach }: { value: number | null; breach?: boolean }) {
	if (value === null || !Number.isFinite(value))
		return <span className="text-muted-foreground">—</span>;
	const negative = value < 0;
	return (
		<span
			className={cn(
				"tnum",
				breach
					? "font-bold text-destructive"
					: negative
						? "text-warning"
						: "text-foreground",
			)}
		>
			{breach && <span aria-hidden>⚠ </span>}
			{formatNaira(value)}
		</span>
	);
}

function PresenceDot({ ok, label }: { ok: boolean; label: string }) {
	return (
		<span
			title={label}
			className={cn("inline-block size-2.5 rounded-full", ok ? "bg-success" : "bg-destructive/70")}
		/>
	);
}

export default function ReconciliationTable({ rows }: { rows: ReconRow[] }) {
	const [filter, setFilter] = useState<Filter>("breaches");
	const shown =
		filter === "breaches" ? rows.filter((r) => r.jiveBreach || r.collateralBreach || r.presenceIssue) : rows;

	return (
		<Card className="print-block gap-0 py-0">
			<CardHeader className="flex-row items-center justify-between gap-3 border-b border-border py-4">
				<div>
					<CardTitle>Reconciliation</CardTitle>
					<CardDescription>
						{rows.length} banks · joined by 10-digit code (mirrors NIBBS_CHECKER)
					</CardDescription>
				</div>
				<CardAction className="no-print row-start-1 self-center">
					<div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
						{(["all", "breaches"] as Filter[]).map((f) => (
							<button
								key={f}
								type="button"
								onClick={() => setFilter(f)}
								className={cn(
									"rounded-md px-3 py-1.5 capitalize transition-colors",
									filter === f
										? "bg-foreground text-background"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{f === "all" ? "All banks" : "Breaches only"}
							</button>
						))}
					</div>
				</CardAction>
			</CardHeader>

			<div className="max-h-[560px] overflow-auto">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm [&_tr]:border-b-border">
						<TableRow className="hover:bg-transparent">
							<TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide">Bank</TableHead>
							<TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wide">
								Collateral (C)
							</TableHead>
							<TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wide">
								Smartdet (H)
							</TableHead>
							<TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-wide">
								Frame (O)
							</TableHead>
							<TableHead
								className="px-3 py-3 text-right text-[11px] uppercase tracking-wide"
								title="H − O (must be 0)"
							>
								Jive (H−O)
							</TableHead>
							<TableHead
								className="px-3 py-3 text-right text-[11px] uppercase tracking-wide"
								title="C + H (must be ≥ 0)"
							>
								Collat. (C+H)
							</TableHead>
							<TableHead
								className="px-3 py-3 text-center text-[11px] uppercase tracking-wide"
								title="Present in Master · HTML · eTranzact"
							>
								M·H·E
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((r, i) => {
							const rowBreach = r.jiveBreach || r.collateralBreach;
							return (
								<TableRow
									key={r.code}
									className={cn(
										"align-middle",
										rowBreach ? "bg-destructive/5 hover:bg-destructive/10" : i % 2 ? "bg-muted/30" : "",
									)}
								>
									<TableCell className="px-4 py-2.5">
										<div className="font-medium text-foreground">{r.name}</div>
										<div className="tnum text-[11px] text-muted-foreground">{r.code}</div>
										{r.mergeNote && (
											<div className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
												<GitMerge className="size-3" />
												{r.mergeNote}
											</div>
										)}
									</TableCell>
									<TableCell className="px-3 py-2.5 text-right">
										<Amount value={r.collateral} />
									</TableCell>
									<TableCell className="px-3 py-2.5 text-right">
										<Amount value={r.smartdetAmount} />
									</TableCell>
									<TableCell className="px-3 py-2.5 text-right">
										<Amount value={r.frameAmount} />
									</TableCell>
									<TableCell className="px-3 py-2.5 text-right">
										<Amount value={r.jive} breach={r.jiveBreach} />
									</TableCell>
									<TableCell className="px-3 py-2.5 text-right">
										<Amount value={r.collateralCheck} breach={r.collateralBreach} />
									</TableCell>
									<TableCell className="px-3 py-2.5">
										<div className="flex items-center justify-center gap-1.5">
											<PresenceDot ok={r.inMaster} label="Master" />
											<PresenceDot ok={r.inFrame} label="HTML (Frame)" />
											<PresenceDot ok={r.inSmartdet} label="eTranzact (Smartdet)" />
										</div>
									</TableCell>
								</TableRow>
							);
						})}
						{shown.length === 0 && (
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
									{filter === "breaches" ? (
										<span className="inline-flex items-center gap-1.5">
											<CheckCircle2 className="size-4 text-success" />
											No breaches — switch to &ldquo;All banks&rdquo; to see every row.
										</span>
									) : (
										"No rows to show."
									)}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</Card>
	);
}
