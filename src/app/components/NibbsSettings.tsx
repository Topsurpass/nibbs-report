"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { MasterBank } from "@/lib/master";
import { formatNaira } from "@/lib/format";
import { mergeBanks, parseMasterFromRows } from "@/lib/importBanks";

interface Props {
	master: MasterBank[];
	/** Persist the full list to the DB; resolves to the stored rows or throws. */
	onSave: (list: MasterBank[]) => Promise<MasterBank[]>;
	/** Replace the list with the built-in defaults; resolves to the stored rows. */
	onReset: () => Promise<MasterBank[]>;
}

interface ImportMsg {
	ok: string;
	errors: string[];
}

/**
 * NIBBS configuration screen: the master bank list plus each bank's posted
 * collateral. This reference data is not carried by the uploaded HTML/TXT files,
 * so it is maintained here and persisted to the shared Neon database. Edits are
 * staged in a draft and written on Save; an Excel upload merges rows into the
 * draft for review before saving.
 */
export default function NibbsSettings({ master, onSave, onReset }: Props) {
	const [draft, setDraft] = useState<MasterBank[]>(master);
	const [dirty, setDirty] = useState(false);
	const [saved, setSaved] = useState(false);
	const [saving, setSaving] = useState(false);
	const [resetting, setResetting] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [importMsg, setImportMsg] = useState<ImportMsg | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const update = (i: number, patch: Partial<MasterBank>) => {
		setDraft((d) => d.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
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

	const save = async () => {
		setSaveError(null);
		const cleaned = draft.filter((b) => b.code.trim() && b.name.trim());

		// Client-side guard so the DB contract's errors surface as clear messages.
		const badCodes = cleaned.filter((b) => !/^\d{10}$/.test(b.code.trim()));
		if (badCodes.length > 0) {
			setSaveError(
				`Fix bank code(s) — must be exactly 10 digits: ${badCodes
					.map((b) => `"${b.code}"`)
					.join(", ")}`,
			);
			return;
		}
		const negative = cleaned.filter((b) => Number(b.collateral) < 0);
		if (negative.length > 0) {
			setSaveError("Collateral cannot be negative.");
			return;
		}

		setSaving(true);
		try {
			const stored = await onSave(
				cleaned.map((b) => ({
					code: b.code.trim(),
					name: b.name.trim(),
					collateral: Number(b.collateral) || 0,
				})),
			);
			setDraft(stored);
			setDirty(false);
			setSaved(true);
			setImportMsg(null);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Couldn't save. Try again.");
		} finally {
			setSaving(false);
		}
	};

	const reset = async () => {
		if (!window.confirm("Reset the master list to the built-in defaults? This overwrites the stored list.")) {
			return;
		}
		setResetting(true);
		setSaveError(null);
		try {
			await onReset(); // parent remounts this component with the fresh list
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Couldn't reset. Try again.");
			setResetting(false);
		}
	};

	const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setImportMsg(null);
		try {
			const buf = await file.arrayBuffer();
			const wb = XLSX.read(buf, { type: "array" });
			const sheet = wb.Sheets[wb.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json(sheet, {
				header: 1,
				blankrows: false,
			}) as unknown[][];
			const { banks, errors } = parseMasterFromRows(rows);
			if (banks.length === 0) {
				setImportMsg({
					ok: "",
					errors: errors.length ? errors : ["No bank rows found in that file."],
				});
				return;
			}
			setDraft((d) => mergeBanks(d, banks));
			setDirty(true);
			setSaved(false);
			setImportMsg({
				ok: `Imported ${banks.length} bank${banks.length === 1 ? "" : "s"}. Review the table, then Save to persist.`,
				errors,
			});
		} catch {
			setImportMsg({
				ok: "",
				errors: ["Could not read that file. Use a 2-column .xlsx / .xls / .csv."],
			});
		} finally {
			if (fileRef.current) fileRef.current.value = "";
		}
	};

	const totalCollateral = draft.reduce((s, b) => s + (Number(b.collateral) || 0), 0);

	return (
		<div>
			<header className="hero-gradient text-white">
				<div className="px-6 py-9 sm:px-10">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
						Configuration
					</p>
					<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">NIBBS Settings</h1>
					<p className="mt-2 max-w-2xl text-sm text-white/80">
						Master bank list and posted collateral used by the settlement audit. Edits are saved to
						the shared database and applied to every audit run.
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
							<span className="tnum font-medium">₦{formatNaira(totalCollateral)}</span>
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<input
							ref={fileRef}
							type="file"
							accept=".xlsx,.xls,.csv"
							onChange={onImportFile}
							className="hidden"
						/>
						<button
							onClick={() => fileRef.current?.click()}
							className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
							title={`Upload a 2-column sheet: "Bank name - 10-digit code" | collateral`}
						>
							⬆ Import Excel
						</button>
						<button
							onClick={add}
							className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5"
						>
							+ Add bank
						</button>
						<button
							onClick={reset}
							disabled={resetting || saving}
							className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
						>
							{resetting ? "Resetting…" : "Reset to defaults"}
						</button>
						<button
							onClick={save}
							disabled={!dirty || saving}
							className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{saving ? "Saving…" : dirty ? "Save changes" : saved ? "✓ Saved" : "Saved"}
						</button>
					</div>
				</div>

				{saveError && (
					<div
						role="alert"
						className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
					>
						{saveError}
					</div>
				)}

				{importMsg && (
					<div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
						{importMsg.ok && (
							<p className="font-medium text-teal-700 dark:text-teal-300">{importMsg.ok}</p>
						)}
						{importMsg.errors.length > 0 && (
							<div className="text-amber-700 dark:text-amber-300">
								<p className="font-medium">
									{importMsg.errors.length} row{importMsg.errors.length === 1 ? "" : "s"} skipped:
								</p>
								<ul className="ml-4 list-disc text-xs">
									{importMsg.errors.slice(0, 8).map((e, i) => (
										<li key={i}>{e}</li>
									))}
									{importMsg.errors.length > 8 && (
										<li>…and {importMsg.errors.length - 8} more</li>
									)}
								</ul>
							</div>
						)}
					</div>
				)}

				<div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
					<div className="max-h-[600px] overflow-auto">
						<table className="w-full text-sm">
							<thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
								<tr className="text-left text-[11px] uppercase tracking-wide text-muted">
									<th className="px-4 py-3 font-semibold">Bank code</th>
									<th className="px-4 py-3 font-semibold">Bank name</th>
									<th className="px-4 py-3 text-right font-semibold">Collateral (₦)</th>
									<th className="px-3 py-3"></th>
								</tr>
							</thead>
							<tbody>
								{draft.map((b, i) => (
									<tr key={i} className="border-t border-border">
										<td className="px-4 py-1.5">
											<input
												value={b.code}
												onChange={(e) => update(i, { code: e.target.value })}
												placeholder="10-digit code"
												className="tnum w-32 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
											/>
										</td>
										<td className="px-4 py-1.5">
											<input
												value={b.name}
												onChange={(e) => update(i, { name: e.target.value })}
												placeholder="Bank name"
												className="w-full min-w-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
											/>
										</td>
										<td className="px-4 py-1.5 text-right">
											<input
												type="number"
												value={b.collateral}
												onChange={(e) =>
													update(i, { collateral: Number(e.target.value) || 0 })
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
										<td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
											No banks. Click “Add bank” or Import Excel to start.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				<p className="text-xs text-muted">
					Tip: the bank code is the 10-digit NIBBS settlement code used to match the HTML and
					eTranzact files. Excel import expects two columns — <span className="font-medium">
						Bank name - 10-digit code
					</span>{" "}
					and collateral. Changes take effect on your next audit run.
				</p>
			</div>
		</div>
	);
}
