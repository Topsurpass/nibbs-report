"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Plus, RotateCcw, Check, Lock, X, Loader2, Settings, Landmark, Wallet, Scale, Search } from "lucide-react";
import type { MasterBank } from "@/lib/master";
import { formatNaira } from "@/lib/format";
import { mergeBanks, parseMasterFromRows } from "@/lib/importBanks";
import PageHeader from "./layout/PageHeader";
import StatTile from "./layout/StatTile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

/** Reads as text until hovered or focused, so a 28-row table isn't a wall of boxes. */
const cellInputCls =
	"h-8 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive/60";

const CODE_RE = /^\d{10}$/;

/**
 * Collateral shown with separators (₦1,200,000,000.00) while reading, and as
 * the raw number while editing, so the figure is legible but still typeable.
 */
function CollateralInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
	const [editing, setEditing] = useState(false);
	return (
		<input
			inputMode="decimal"
			value={editing ? String(value) : formatNaira(value)}
			onFocus={(e) => {
				setEditing(true);
				requestAnimationFrame(() => e.target.select());
			}}
			onBlur={() => setEditing(false)}
			onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
			aria-label="Collateral"
			className={cn(cellInputCls, "tnum w-48 text-right")}
		/>
	);
}

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

	const [query, setQuery] = useState("");
	// Keep each row's index into `draft`, so filtering never edits the wrong bank.
	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return draft
			.map((b, i) => ({ b, i }))
			.filter(({ b }) => !q || b.name.toLowerCase().includes(q) || b.code.includes(q));
	}, [draft, query]);
	const invalidCodes = draft.filter((b) => !CODE_RE.test(b.code)).length;

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
						<div className="flex flex-wrap items-center gap-3">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
									dirty ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
								)}
							>
								<span className="size-1.5 rounded-full bg-current" />
								{dirty ? "Unsaved changes" : "All changes saved"}
							</span>
							<Button type="button" onClick={save} disabled={!dirty || saving}>
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
							<div className="text-sm text-warning">
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
					<div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
						<div className="relative min-w-56 flex-1 sm:max-w-xs">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search bank or code"
								aria-label="Search banks"
								className="pl-8"
							/>
						</div>
						<p className="tnum text-xs text-muted-foreground">
							{query.trim() ? `${rows.length} of ${draft.length} banks` : `${draft.length} banks`}
							{canEdit && invalidCodes > 0 && (
								<span className="ml-2 font-medium text-destructive">
									· {invalidCodes} code{invalidCodes === 1 ? "" : "s"} not 10 digits
								</span>
							)}
						</p>
						{canEdit && (
							<div className="ml-auto flex flex-wrap items-center gap-2">
								<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onImportFile} className="hidden" />
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={reset}
									disabled={resetting || saving}
									className="text-muted-foreground"
								>
									{resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
									{resetting ? "Resetting…" : "Reset to defaults"}
								</Button>
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
								<Button type="button" size="sm" onClick={add}>
									<Plus />
									Add bank
								</Button>
							</div>
						)}
					</div>
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
								{rows.map(({ b, i }) =>
									canEdit ? (
										<TableRow key={i} className="group">
											<TableCell className="px-4 py-1.5">
												<input
													value={b.code}
													onChange={(e) => update(i, { code: e.target.value })}
													placeholder="10-digit code"
													aria-label="Bank code"
													aria-invalid={!CODE_RE.test(b.code)}
													className={cn(cellInputCls, "tnum w-32")}
												/>
											</TableCell>
											<TableCell className="px-4 py-1.5">
												<input
													value={b.name}
													onChange={(e) => update(i, { name: e.target.value })}
													placeholder="Bank name"
													aria-label="Bank name"
													className={cn(cellInputCls, "w-full min-w-[180px]")}
												/>
											</TableCell>
											<TableCell className="px-4 py-1.5 text-right">
												<CollateralInput value={Number(b.collateral) || 0} onChange={(v) => update(i, { collateral: v })} />
											</TableCell>
											<TableCell className="px-3 py-1.5 text-center">
												<button
													type="button"
													onClick={() => remove(i)}
													className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
													title="Remove bank"
													aria-label={`Remove ${b.name || "bank"}`}
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
								{draft.length > 0 && rows.length === 0 && (
									<TableRow className="hover:bg-transparent">
										<TableCell colSpan={canEdit ? 4 : 3} className="px-4 py-10 text-center text-sm text-muted-foreground">
											No bank matches &ldquo;{query}&rdquo;.
										</TableCell>
									</TableRow>
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
