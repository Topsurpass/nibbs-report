"use client";

import { groupLabel } from "@/lib/escalation/names";
import { formatAmount } from "@/lib/escalation/parseRows";
import type { BankGroup } from "@/lib/escalation/types";

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
export default function BankGroupTable({
	groups,
	grandTotal,
	downloading,
	onDownload,
}: BankGroupTableProps) {
	const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

	return (
		<div className="overflow-x-auto rounded-2xl border border-border bg-surface">
			<table className="w-full min-w-[560px] text-sm">
				<thead>
					<tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
						<th className="px-4 py-3 font-semibold">Beneficiary bank</th>
						<th className="px-4 py-3 font-semibold">Code</th>
						<th className="px-4 py-3 text-right font-semibold">Txns</th>
						<th className="px-4 py-3 text-right font-semibold">Total</th>
						<th className="px-4 py-3" />
					</tr>
				</thead>
				<tbody>
					{groups.map((group) => (
						<tr
							key={group.code}
							className={`border-b border-border last:border-0 ${
								group.unmapped ? "bg-amber-500/5" : ""
							}`}
						>
							<td className="px-4 py-3 font-medium text-foreground">
								{group.unmapped && (
									<span className="mr-1.5" aria-hidden>
										⚠
									</span>
								)}
								{groupLabel(group)}
							</td>
							<td className="px-4 py-3 font-mono text-xs text-muted">{group.code}</td>
							<td className="px-4 py-3 text-right tabular-nums text-foreground">
								{group.rows.length.toLocaleString()}
							</td>
							<td className="px-4 py-3 text-right tabular-nums text-foreground">
								{formatAmount(group.total)}
							</td>
							<td className="px-4 py-3 text-right">
								<button
									type="button"
									onClick={() => onDownload(group)}
									disabled={downloading === group.code}
									className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
								>
									{downloading === group.code ? "Building…" : ".xlsx"}
								</button>
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="border-t border-border bg-black/[0.03] font-semibold dark:bg-white/[0.03]">
						<td className="px-4 py-3 text-foreground">
							TOTAL ({groups.length} bank{groups.length === 1 ? "" : "s"})
						</td>
						<td className="px-4 py-3" />
						<td className="px-4 py-3 text-right tabular-nums text-foreground">
							{totalRows.toLocaleString()}
						</td>
						<td className="px-4 py-3 text-right tabular-nums text-foreground">
							{formatAmount(grandTotal)}
						</td>
						<td className="px-4 py-3" />
					</tr>
				</tfoot>
			</table>
		</div>
	);
}
