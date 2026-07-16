"use client";

import { useState } from "react";
import type { BreachRecord } from "@/lib/reconcile";
import { formatNaira } from "@/lib/format";
import {
	BREACH_COLUMNS,
	buildBreachClipboard,
	downloadBreachExcel,
} from "@/lib/exportReport";

interface Props {
	breaches: BreachRecord[];
	reportDate: Date;
	onChange: (index: number, patch: Partial<BreachRecord>) => void;
}

const STATUS_OPTIONS = ["UNACCEPTABLE", "UNDER REVIEW", "ACCEPTED", "RESOLVED"];

export default function BreachSection({
	breaches,
	reportDate,
	onChange,
}: Props) {
	const [copied, setCopied] = useState(false);

	const copyTable = async () => {
		const { html, tsv } = buildBreachClipboard(breaches);
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([tsv], { type: "text/plain" }),
				}),
			]);
		} catch {
			try {
				await navigator.clipboard.writeText(tsv);
			} catch {
				/* clipboard unavailable */
			}
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1800);
	};

	if (breaches.length === 0) {
		return (
			<div className="print-block rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center ring-1 ring-inset ring-emerald-500/20">
				<p className="text-2xl">✓</p>
				<p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
					No breaches — nothing to escalate
				</p>
				<p className="text-xs text-muted">
					All banks reconcile and collateral coverage is intact.
				</p>
			</div>
		);
	}

	const cellBase = "border border-border px-3 py-2 text-sm align-middle";

	return (
		<div className="print-block overflow-hidden rounded-2xl border border-red-500/30 bg-surface shadow-sm">
			{/* Toolbar */}
			<div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/5 px-5 py-4">
				<div>
					<h2 className="flex items-center gap-2 text-base font-semibold text-red-700 dark:text-red-300">
						<span aria-hidden>⚠</span> Breached Section for
						Escalation
					</h2>
					<p className="text-xs text-muted">
						{breaches.length} item(s) · edit Status/Reason, then
						copy straight into your reply
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						onClick={copyTable}
						className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
					>
						{copied ? "✓ Copied" : "📋 Copy table"}
					</button>
					<button
						onClick={() =>
							downloadBreachExcel(breaches, reportDate)
						}
						className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-black/5 dark:hover:bg-white/5"
					>
						⬇ Excel
					</button>
				</div>
			</div>

			<p className="no-print px-5 pt-3 text-[11px] text-muted">
				Tip: “Copy table” copies a formatted grid — paste it directly
				into an Outlook/Gmail reply or a new Excel sheet.
			</p>

			{/* Excel-style grid */}
			<div className="overflow-x-auto p-4">
				<table className="w-full min-w-[820px] border-collapse">
					{/*<caption className="mb-0 border border-b-0 border-border bg-red-600 px-3 py-2 text-left text-sm font-bold text-white">
						Breached Section For Escalation —{" "}
						{reportDate.toLocaleDateString("en-GB")}
					</caption>*/}
					<thead>
						<tr className="bg-amber-300/80 text-slate-900 dark:bg-amber-400/80">
							{BREACH_COLUMNS.map((c) => (
								<th
									key={c}
									className="border border-border px-3 py-2 text-left text-xs font-bold uppercase tracking-wide"
								>
									{c}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{breaches.map((b, i) => (
							<tr
								key={`${b.code}-${b.kind}`}
								className="odd:bg-black/[0.015] dark:odd:bg-white/[0.02]"
							>
								<td className={cellBase}>
									<div className="font-medium text-foreground">
										{b.name}
									</div>
									<div className="tnum text-[11px] text-muted">
										{b.code}
									</div>
								</td>
								<td
									className={`${cellBase} tnum text-right text-foreground`}
								>
									{formatNaira(b.netSettlementPosition)}
								</td>
								<td
									className={`${cellBase} tnum text-right text-foreground`}
								>
									{b.collateral === null
										? "—"
										: formatNaira(b.collateral)}
								</td>
								<td
									className={`${cellBase} tnum text-right font-semibold text-red-600 dark:text-red-400`}
								>
									{formatNaira(b.variance)}
								</td>
								<td className={`${cellBase} p-0`}>
									<select
										value={b.status}
										onChange={(e) =>
											onChange(i, {
												status: e.target.value,
											})
										}
										className="w-full bg-transparent px-3 py-2 text-sm font-medium text-foreground outline-none focus:bg-indigo-500/5"
									>
										{STATUS_OPTIONS.map((o) => (
											<option key={o} value={o}>
												{o}
											</option>
										))}
									</select>
								</td>
								<td className={`${cellBase} p-0`}>
									<input
										type="text"
										value={b.reason}
										onChange={(e) =>
											onChange(i, {
												reason: e.target.value,
											})
										}
										className="w-full min-w-[180px] bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:bg-indigo-500/5"
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
