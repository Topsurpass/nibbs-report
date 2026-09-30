"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Plus, RotateCcw, Check, Lock, X, Loader2, Settings, Landmark, Wallet, Scale } from "lucide-react";
import type { MasterBank } from "@/lib/master";
import { formatNaira } from "@/lib/format";
import { mergeBanks, parseMasterFromRows } from "@/lib/importBanks";
import PageHeader from "./layout/PageHeader";
import StatTile from "./layout/StatTile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Props {
	master: MasterBank[];
	/**
	 * Whether this user may change the list. False renders the same data as a
	 * plain read-only table with no controls — the screen stays useful to an
	 * analyst who needs to look a code or a collateral figure up.
	 */
	canEdit: boolean;
	/** Persist the full list to the DB; resolves to the stored rows or throws. */
	onSave: (list: MasterBank[]) => Promise<MasterBank[]>;
	/** Replace the list with the built-in defaults; resolves to the stored rows. */
	onReset: () => Promise<MasterBank[]>;
}

interface ImportMsg {
	ok: string;
	errors: string[];
}

const cellInputCls =
	"h-8 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * NIBBS configuration screen: the master bank list plus each bank's posted
 * collateral. This reference data is not carried by the uploaded HTML/TXT files,
 * so it is maintained here and persisted to the shared Neon database. Edits are
 * staged in a draft and written on Save; an Excel upload merges rows into the
 * draft for review before saving.
 *
 * `canEdit` gates every control. It is a rendering decision only: the list is
 * shared reference data feeding every audit, so `/api/banks` re-checks the same
 * rule and refuses a write from anyone else regardless of what was rendered.
 */
export default function NibbsSettings({ master, canEdit, onSave, onReset }: Props) {
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
		if (!canEdit) return;
		setSaveError(null);
		const cleaned = draft.filter((b) => b.code.trim() && b.name.trim());

		// Client-side guard so the DB contract's errors surface as clear messages.
		const badCodes = cleaned.filter((b) => !/^\d{10}$/.test(b.code.trim()));
		if (badCodes.length > 0) {
			setSaveError(
				`Fix bank code(s) — must be exactly 10 digits: ${badCodes.map((b) => `"${b.code}"`).join(", ")}`,
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
		if (!canEdit) return;
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
		if (!file || !canEdit) return;
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

	const avgCollateral = draft.length > 0 ? totalCollateral / draft.length : 0;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={Settings}
				eyebrow="Configuration"
				title="NIBBS Settings"
				description={
					canEdit
						? "Master bank list and posted collateral used by the settlement audit. Edits are saved to the shared database and applied to every audit run."
						: "Master bank list and posted collateral used by the settlement audit. This list is shared by the whole team, so only an admin can change it."
				}
				actions={
					canEdit ? (
						<div className="flex flex-wrap items-center gap-2">
							<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onImportFile} className="hidden" />
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => fileRef.current?.click()}
								title='Upload a 2-column sheet: "Bank name - 10-digit code" | collateral'
							>
								<Upload />
								Import Excel
							</Button>
							<Button type="button" variant="outline" size="sm" onClick={add}>
								<Plus />
								Add bank
							</Button>
							<Button type="button" variant="outline" size="sm" onClick={reset} disabled={resetting || saving}>
								{resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
								{resetting ? "Resetting…" : "Reset to defaults"}
							</Button>
							<Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
								{saving ? <Loader2 className="animate-spin" /> : dirty ? null : <Check />}
								{saving ? "Saving…" : dirty ? "Save changes" : saved ? "Saved" : "Saved"}
							</Button>
						</div>
					) : (
						/* Say who can change it, so a read-only screen reads as a
						   deliberate rule rather than a page that failed to load. */
						<Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs font-medium">
							<Lock className="size-3" />
							View only · ask an admin to change the list
						</Badge>
					)
				}
			/>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<StatTile icon={Landmark} label="Banks configured" value={draft.length} />
				<StatTile icon={Wallet} label="Total collateral" value={`₦${formatNaira(totalCollateral)}`} />
				<StatTile
					icon={Scale}
					label="Average per bank"
					value={`₦${formatNaira(avgCollateral)}`}
					className="col-span-2 sm:col-span-1"
				/>
			</div>

			<div className="space-y-4">
				{saveError && (
					<Alert variant="destructive" role="alert">
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				{importMsg && (
					<Card className="gap-1 p-3">
						{importMsg.ok && <p className="text-sm font-medium text-brand-teal">{importMsg.ok}</p>}
						{importMsg.errors.length > 0 && (
							<div className="text-sm text-amber-700 dark:text-amber-300">
								<p className="font-medium">
									{importMsg.errors.length} row{importMsg.errors.length === 1 ? "" : "s"} skipped:
								</p>
								<ul className="ml-4 list-disc text-xs">
									{importMsg.errors.slice(0, 8).map((e, i) => (
										<li key={i}>{e}</li>
									))}
									{importMsg.errors.length > 8 && <li>…and {importMsg.errors.length - 8} more</li>}
								</ul>
							</div>
						)}
					</Card>
				)}

				<Card className="gap-0 overflow-hidden py-0">
					<div className="max-h-[600px] overflow-auto">
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
								<TableRow className="hover:bg-transparent">
									<TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide">Bank code</TableHead>
									<TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide">Bank name</TableHead>
									<TableHead className="px-4 py-3 text-right text-[11px] uppercase tracking-wide">
										Collateral (₦)
									</TableHead>
									{canEdit && <TableHead className="w-10" />}
								</TableRow>
							</TableHeader>
							<TableBody>
								{draft.map((b, i) =>
									canEdit ? (
										<TableRow key={i}>
											<TableCell className="px-4 py-1.5">
												<input
													value={b.code}
													onChange={(e) => update(i, { code: e.target.value })}
													placeholder="10-digit code"
													className={cn(cellInputCls, "tnum w-32")}
												/>
											</TableCell>
											<TableCell className="px-4 py-1.5">
												<input
													value={b.name}
													onChange={(e) => update(i, { name: e.target.value })}
													placeholder="Bank name"
													className={cn(cellInputCls, "w-full min-w-[180px]")}
												/>
											</TableCell>
											<TableCell className="px-4 py-1.5 text-right">
												<input
													type="number"
													value={b.collateral}
													onChange={(e) => update(i, { collateral: Number(e.target.value) || 0 })}
													className={cn(cellInputCls, "tnum w-44 text-right")}
												/>
											</TableCell>
											<TableCell className="px-3 py-1.5 text-center">
												<button
													type="button"
													onClick={() => remove(i)}
													className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
													title="Remove bank"
												>
													<X className="size-3.5" />
												</button>
											</TableCell>
										</TableRow>
									) : (
										/* Text, not disabled inputs: a read-only row should look
										   like a record, not like a form somebody switched off.
										   Collateral is formatted the way it reads everywhere
										   else in the app rather than as a raw number. */
										<TableRow key={i}>
											<TableCell className="tnum px-4 py-2.5 text-foreground">{b.code}</TableCell>
											<TableCell className="px-4 py-2.5 text-foreground">{b.name}</TableCell>
											<TableCell className="tnum px-4 py-2.5 text-right text-foreground">
												₦{formatNaira(Number(b.collateral) || 0)}
											</TableCell>
										</TableRow>
									),
								)}
								{draft.length === 0 && (
									<TableRow className="hover:bg-transparent">
										<TableCell colSpan={canEdit ? 4 : 3} className="px-4 py-10 text-center text-sm text-muted-foreground">
											{canEdit
												? "No banks. Click “Add bank” or Import Excel to start."
												: "No banks configured yet. An admin needs to set the list up."}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</Card>

				<p className="text-xs text-muted-foreground">
					{canEdit ? (
						<>
							Tip: the bank code is the 10-digit NIBBS settlement code used to match the HTML and eTranzact
							files. Excel import expects two columns —{" "}
							<span className="font-medium">Bank name - 10-digit code</span> and collateral. Changes take
							effect on your next audit run.
						</>
					) : (
						<>
							Tip: the bank code is the 10-digit NIBBS settlement code used to match the HTML and eTranzact
							files. These figures are what your audit runs against — if one looks wrong, send an admin the
							bank and the correct amount.
						</>
					)}
				</p>
			</div>
		</div>
	);
}
