"use client";

import { useState } from "react";
import type { ReconRow } from "@/lib/reconcile";
import { formatNaira } from "@/lib/format";

type Filter = "all" | "breaches";

function Amount({ value, breach }: { value: number | null; breach?: boolean }) {
	if (value === null || !Number.isFinite(value))
		return <span className="text-muted">—</span>;
	const negative = value < 0;
	return (
		<span
			className={`tnum ${
				breach
					? "font-bold text-red-600 dark:text-red-400"
					: negative
						? "text-amber-600 dark:text-amber-400"
						: "text-foreground"
			}`}
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
			className={`inline-block h-2.5 w-2.5 rounded-full ${
				ok ? "bg-emerald-500" : "bg-red-400"
			}`}
		/>
	);
}

export default function ReconciliationTable({ rows }: { rows: ReconRow[] }) {
	const [filter, setFilter] = useState<Filter>("breaches");
	const shown =
		filter === "breaches"
			? rows.filter(
					(r) =>
						r.jiveBreach || r.collateralBreach || r.presenceIssue,
				)
			: rows;

	return (
		<div className="print-block rounded-2xl border border-border bg-surface shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div>
					<h2 className="text-base font-semibold text-foreground">
						Reconciliation
					</h2>
					<p className="text-xs text-muted">
						{rows.length} banks · joined by 10-digit code (mirrors
						NIBBS_CHECKER)
					</p>
				</div>
				<div className="no-print inline-flex rounded-lg border border-border p-0.5 text-xs font-medium">
					{(["all", "breaches"] as Filter[]).map((f) => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
								filter === f
									? "bg-foreground text-background"
									: "text-muted hover:text-foreground"
							}`}
						>
							{f === "all" ? "All banks" : "Breaches only"}
						</button>
					))}
				</div>
			</div>

			<div className="max-h-[560px] overflow-auto">
				<table className="w-full border-collapse text-sm">
					<thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
						<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
							<th className="px-4 py-3 font-semibold">Bank</th>
							<th className="px-3 py-3 text-right font-semibold">
								Collateral (C)
							</th>
							<th className="px-3 py-3 text-right font-semibold">
								Smartdet (H)
							</th>
							<th className="px-3 py-3 text-right font-semibold">
								Frame (O)
							</th>
							<th
								className="px-3 py-3 text-right font-semibold"
								title="H − O (must be 0)"
							>
								Jive (H−O)
							</th>
							<th
								className="px-3 py-3 text-right font-semibold"
								title="C + H (must be ≥ 0)"
							>
								Collat. (C+H)
							</th>
							<th
								className="px-3 py-3 text-center font-semibold"
								title="Present in Master · HTML · eTranzact"
							>
								M·H·E
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((r, i) => {
							const rowBreach =
								r.jiveBreach || r.collateralBreach;
							return (
								<tr
									key={r.code}
									className={`border-t border-border align-middle ${
										rowBreach
											? "bg-red-500/5"
											: i % 2
												? "bg-black/[0.015] dark:bg-white/[0.015]"
												: ""
									}`}
								>
									<td className="px-4 py-2.5">
										<div className="font-medium text-foreground">
											{r.name}
										</div>
										<div className="tnum text-[11px] text-muted">
											{r.code}
										</div>
									</td>
									<td className="px-3 py-2.5 text-right">
										<Amount value={r.collateral} />
									</td>
									<td className="px-3 py-2.5 text-right">
										<Amount value={r.smartdetAmount} />
									</td>
									<td className="px-3 py-2.5 text-right">
										<Amount value={r.frameAmount} />
									</td>
									<td className="px-3 py-2.5 text-right">
										<Amount
											value={r.jive}
											breach={r.jiveBreach}
										/>
									</td>
									<td className="px-3 py-2.5 text-right">
										<Amount
											value={r.collateralCheck}
											breach={r.collateralBreach}
										/>
									</td>
									<td className="px-3 py-2.5">
										<div className="flex items-center justify-center gap-1.5">
											<PresenceDot
												ok={r.inMaster}
												label="Master"
											/>
											<PresenceDot
												ok={r.inFrame}
												label="HTML (Frame)"
											/>
											<PresenceDot
												ok={r.inSmartdet}
												label="eTranzact (Smartdet)"
											/>
										</div>
									</td>
								</tr>
							);
						})}
						{shown.length === 0 && (
							<tr>
								<td
									colSpan={7}
									className="px-4 py-8 text-center text-sm text-muted"
								>
									{filter === "breaches"
										? "✓ No breaches — switch to “All banks” to see every row."
										: "No rows to show."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
