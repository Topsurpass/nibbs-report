"use client";

import { useState } from "react";
import type { MasterBank } from "@/lib/master";
import { formatNaira } from "@/lib/format";

interface Props {
	master: MasterBank[];
	onSave: (list: MasterBank[]) => void;
	onReset: () => void;
}

/**
 * NIBBS configuration screen: the master bank list plus each bank's posted
 * collateral. This reference data is not carried by the uploaded HTML/TXT files,
 * so it is maintained here and persisted in the browser.
 */
export default function NibbsSettings({ master, onSave, onReset }: Props) {
	const [draft, setDraft] = useState<MasterBank[]>(master);
	const [dirty, setDirty] = useState(false);
	const [saved, setSaved] = useState(false);

	const update = (i: number, patch: Partial<MasterBank>) => {
		setDraft((d) =>
			d.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
		);
		setDirty(true);
		setSaved(false);
	};
	const remove = (i: number) => {
		setDraft((d) => d.filter((_, idx) => idx !== i));
		setDirty(true);
		setSaved(false);
	};
	const add = () => {
		setDraft((d) => [...d, { code: "", name: "", collateral: 0 }]);
		setDirty(true);
		setSaved(false);
	};
	const save = () => {
		const cleaned = draft.filter((b) => b.code.trim() && b.name.trim());
		onSave(cleaned);
		setDraft(cleaned);
		setDirty(false);
		setSaved(true);
	};

	const totalCollateral = draft.reduce(
		(s, b) => s + (Number(b.collateral) || 0),
		0,
	);

	return (
		<div>
			<header className="hero-gradient text-white">
				<div className="px-6 py-9 sm:px-10">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
						Configuration
					</p>
					<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
						NIBBS Settings
					</h1>
					<p className="mt-2 max-w-2xl text-sm text-white/80">
						Master bank list and posted collateral used by the
						settlement audit. Edits are saved in this browser and
						applied to every audit run.
					</p>
				</div>
			</header>

			<div className="space-y-4 px-6 py-8 sm:px-10">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-base font-semibold text-foreground">
							Master bank list &amp; collateral
						</h2>
						<p className="text-xs text-muted">
							{draft.length} banks · total collateral{" "}
							<span className="tnum font-medium">
								₦{formatNaira(totalCollateral)}
							</span>
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button
							onClick={add}
							className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
						>
							+ Add bank
						</button>
						<button
							onClick={onReset}
							className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:bg-black/5 dark:hover:bg-white/5"
						>
							Reset to defaults
						</button>
						<button
							onClick={save}
							disabled={!dirty}
							className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{dirty
								? "Save changes"
								: saved
									? "✓ Saved"
									: "Saved"}
						</button>
					</div>
				</div>

				<div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
					<div className="max-h-[600px] overflow-auto">
						<table className="w-full text-sm">
							<thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
								<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
									<th className="px-4 py-3 font-semibold">
										Bank code
									</th>
									<th className="px-4 py-3 font-semibold">
										Bank name
									</th>
									<th className="px-4 py-3 text-right font-semibold">
										Collateral (₦)
									</th>
									<th className="px-3 py-3"></th>
								</tr>
							</thead>
							<tbody>
								{draft.map((b, i) => (
									<tr
										key={i}
										className="border-t border-border"
									>
										<td className="px-4 py-1.5">
											<input
												value={b.code}
												onChange={(e) =>
													update(i, {
														code: e.target.value,
													})
												}
												placeholder="10-digit code"
												className="tnum w-32 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
											/>
										</td>
										<td className="px-4 py-1.5">
											<input
												value={b.name}
												onChange={(e) =>
													update(i, {
														name: e.target.value,
													})
												}
												placeholder="Bank name"
												className="w-full min-w-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
											/>
										</td>
										<td className="px-4 py-1.5 text-right">
											<input
												type="number"
												value={b.collateral}
												onChange={(e) =>
													update(i, {
														collateral:
															Number(
																e.target.value,
															) || 0,
													})
												}
												className="tnum w-44 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
											/>
										</td>
										<td className="px-3 py-1.5 text-center">
											<button
												onClick={() => remove(i)}
												className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
												title="Remove bank"
											>
												✕
											</button>
										</td>
									</tr>
								))}
								{draft.length === 0 && (
									<tr>
										<td
											colSpan={4}
											className="px-4 py-10 text-center text-sm text-muted"
										>
											No banks. Click “Add bank” to start.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				<p className="text-xs text-muted">
					Tip: the bank code is the 10-digit NIBBS settlement code
					used to match the HTML and eTranzact files. Collateral
					changes take effect on your next audit run.
				</p>
			</div>
		</div>
	);
}
