"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Compass, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import PageHeader from "@/app/components/layout/PageHeader";
import Stepper from "@/app/components/layout/Stepper";
import FileDropzone from "@/app/components/FileDropzone";
import BankGroupTable from "./BankGroupTable";
import ColumnPicker from "./ColumnPicker";
import UnmappedBanner from "./UnmappedBanner";
import { detectColumns } from "@/lib/escalation/detectColumns";
import {
	groupByBank,
	unmappedCodes,
	verifyRowAccounting,
} from "@/lib/escalation/groupByBank";
import {
	mergeDirectory,
	type NipOverride,
} from "@/lib/escalation/nipDirectory";
import { formatAmount } from "@/lib/escalation/parseRows";
import {
	readSpool,
	SpoolReadError,
	type Spool,
} from "@/lib/escalation/readSpool";
import type { BankGroup, CodeMode } from "@/lib/escalation/types";
import TourModal from "@/app/components/onboarding/TourModal";
import { ESCALATION_TOUR, ESCALATION_TOUR_STEPS } from "./escalationTour";
import { useTour } from "@/hooks/useTour";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Drop a spooled fraud export, get one escalation file per beneficiary bank.
 *
 * The preview is computed here in the browser with the same pure modules the
 * download route runs server-side, so the table on screen and the files in the
 * ZIP can never disagree. Only the styled-workbook build happens on the server
 * (exceljs cannot run usefully in the bundle, and there is no reason to ship it).
 */

const STORAGE_KEY = "escalation:columns:v1";

interface Props {
	initialOverrides: NipOverride[];
}

interface Preview {
	spool: Spool;
	codeColumn: string;
	codeMode: CodeMode;
}

/** Remembered column choices, keyed by the file's column signature. */
function loadRemembered(
	signature: string,
): { columns: string[]; includeBankName: boolean } | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const store = JSON.parse(raw) as Record<
			string,
			{ columns: string[]; includeBankName: boolean }
		>;
		return store[signature] ?? null;
	} catch {
		return null;
	}
}

function remember(
	signature: string,
	value: { columns: string[]; includeBankName: boolean },
): void {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const store = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
		store[signature] = value;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		// A full or disabled localStorage must not break the split.
	}
}

export default function EscalationSplitter({ initialOverrides }: Props) {
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<Preview | null>(null);
	const [overrides, setOverrides] = useState<NipOverride[]>(initialOverrides);
	const [error, setError] = useState("");
	const [reading, setReading] = useState(false);

	const [selected, setSelected] = useState<string[]>([]);
	const [includeBankName, setIncludeBankName] = useState(true);
	const [successfulOnly, setSuccessfulOnly] = useState(false);
	const [downloading, setDownloading] = useState<string | null>(null);

	const tour = useTour(ESCALATION_TOUR);

	const directory = useMemo(() => mergeDirectory(overrides), [overrides]);

	const signature = useMemo(
		() => (preview ? preview.spool.headers.join("|") : ""),
		[preview],
	);

	/** Re-derived on every relevant change — this is the single source of truth. */
	const analysis = useMemo(() => {
		if (!preview) return null;
		const { spool, codeColumn, codeMode } = preview;
		const columns = detectColumns(spool.rows, spool.headers, directory);
		const result = groupByBank({
			rows: spool.rows,
			columns,
			directory,
			codeColumn,
			codeMode,
			successfulOnly,
		});
		return { columns, result, balanced: verifyRowAccounting(result) };
	}, [preview, directory, successfulOnly]);

	const onSelect = useCallback(
		async (picked: File) => {
			setError("");
			setReading(true);
			setFile(picked);
			try {
				const spool = readSpool(await picked.arrayBuffer());
				const columns = detectColumns(
					spool.rows,
					spool.headers,
					directory,
				);

				const remembered = loadRemembered(spool.headers.join("|"));
				setSelected(
					remembered
						? spool.headers.filter((h) =>
								remembered.columns.includes(h),
							)
						: [...spool.headers],
				);
				setIncludeBankName(
					remembered ? remembered.includeBankName : true,
				);

				setPreview({
					spool,
					codeColumn:
						columns.code?.column ??
						columns.candidates[0]?.column ??
						"",
					codeMode:
						columns.code?.mode ??
						columns.candidates[0]?.mode ??
						"direct",
				});
				if (!columns.code) {
					setError(
						columns.candidates.length > 0
							? "No beneficiary bank-code column was detected. Confirm the column below before downloading."
							: "No bank-code column was found in that file. Check that it carries a beneficiary issuer code or a 13-character receiver value.",
					);
				}
			} catch (err) {
				setPreview(null);
				setError(
					err instanceof SpoolReadError
						? err.message
						: "Could not read that file. Use a .xlsx, .xls or .csv export.",
				);
			} finally {
				setReading(false);
			}
		},
		[directory],
	);

	// Persist the column choice per file shape, so the next identical spool
	// starts where the last one left off.
	useEffect(() => {
		if (!signature) return;
		remember(signature, { columns: selected, includeBankName });
	}, [signature, selected, includeBankName]);

	const saveOverride = useCallback(async (code: string, name: string) => {
		const res = await fetch("/api/escalations/nip-codes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, name }),
		});
		const body = (await res.json()) as {
			ok: boolean;
			error?: string;
			override?: NipOverride;
		};
		if (!res.ok || !body.ok || !body.override) {
			throw new Error(body.error ?? "Couldn't save that mapping.");
		}
		const saved = body.override;
		// Re-grouping is driven by `directory`, so the table re-labels itself.
		setOverrides((list) => [
			...list.filter((o) => o.code !== saved.code),
			saved,
		]);
	}, []);

	const download = useCallback(
		async (target: string, busyKey: string) => {
			if (!file || !preview) return;
			setDownloading(busyKey);
			setError("");
			try {
				const form = new FormData();
				form.append("file", file);
				form.append(
					"options",
					JSON.stringify({
						columns: selected,
						includeBankName,
						successfulOnly,
						codeColumn: preview.codeColumn,
						codeMode: preview.codeMode,
						sheet: preview.spool.sheetName,
						target,
					}),
				);

				const res = await fetch("/api/escalations/split", {
					method: "POST",
					body: form,
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as {
						error?: string;
					} | null;
					throw new Error(
						body?.error ?? "Couldn't build the escalation files.",
					);
				}

				const blob = await res.blob();
				const name =
					res.headers
						.get("Content-Disposition")
						?.match(/filename="([^"]+)"/)?.[1] ?? "escalation.zip";

				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = name;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Download failed.",
				);
			} finally {
				setDownloading(null);
			}
		},
		[file, preview, selected, includeBankName, successfulOnly],
	);

	const toggle = (header: string) =>
		setSelected((list) =>
			list.includes(header)
				? list.filter((h) => h !== header)
				: [...list, header],
		);

	const result = analysis?.result;
	const unmapped = result ? unmappedCodes(result) : [];
	const nothingSelected = selected.length === 0 && !includeBankName;
	const candidates = analysis?.columns.candidates ?? [];

	return (
		<div className="space-y-6 p-4 md:p-6">
			<TourModal
				open={tour.open}
				title="Fraud Escalation"
				steps={ESCALATION_TOUR_STEPS}
				onDone={tour.complete}
			/>

			<PageHeader
				icon={ShieldAlert}
				eyebrow="Bank Escalation"
				title="Generate excel file for bank beneficiaries"
				description="Drop a spooled transaction file and get one escalation workbook per beneficiary bank, ready to send for lien placement."
				actions={
					/* Replay: the tour auto-shows once, but it has to stay
					    reachable afterwards or it may as well not exist. */
					<Button type="button" variant="outline" onClick={tour.replay}>
						<Compass className="size-4" />
						Show me around
					</Button>
				}
			/>

			<Card className="px-5 py-4">
				<Stepper
					steps={[
						{ label: "Upload spool", description: "Read the export in your browser" },
						{ label: "Review & send", description: "Confirm columns, then split by bank" },
					]}
					current={preview ? 1 : 0}
				/>
			</Card>

			<div className="space-y-6">
				<FileDropzone
					title="Spooled fraudulent transactions"
					subtitle="The export from the database — .xlsx, .xls or .csv"
					accept=".xlsx,.xls,.csv"
					file={file}
					accent="teal"
					summary={
						reading
							? "Reading…"
							: preview
								? `${preview.spool.rows.length.toLocaleString()} rows · sheet "${preview.spool.sheetName}"`
								: undefined
					}
					error={error || undefined}
					onSelect={(picked) => void onSelect(picked)}
				/>

				{preview && result && (
					<div className="space-y-6">
						{/* Bank-code column: always visible and always overridable. Getting
					    this wrong escalates to the sending bank instead of the receiving
					    one, so it is never a silent decision. */}
						<Card className="p-5">
							<div className="flex flex-wrap items-end gap-4">
								<div className="min-w-60 flex-1">
									<label htmlFor="code-column" className="block text-sm font-semibold text-foreground">
										Beneficiary bank-code column
									</label>
									<Select
										value={preview.codeColumn}
										onValueChange={(column) => {
											if (!column) return;
											const match = candidates.find((c) => c.column === column);
											setPreview((p) => (p ? { ...p, codeColumn: column, codeMode: match?.mode ?? "direct" } : p));
										}}
									>
										<SelectTrigger id="code-column" className="mt-2 w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{candidates.length === 0 && (
												<SelectItem value="__none__" disabled>
													No candidate found
												</SelectItem>
											)}
											{candidates.map((c) => (
												<SelectItem key={c.column} value={c.column}>
													{c.column} — {c.mode === "direct" ? "code" : "13-char prefix"},{" "}
													{Math.round(c.matchRate * 100)}% matched
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className="mt-1.5 text-xs text-muted-foreground">
										Confirm this is the <strong>beneficiary</strong> column, not the sender.
									</p>
								</div>

								<label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-foreground">
									<Checkbox checked={successfulOnly} onCheckedChange={() => setSuccessfulOnly((v) => !v)} />
									Successful only
									{result.filteredOut > 0 && (
										<span className="text-xs text-muted-foreground">
											({result.filteredOut.toLocaleString()} hidden)
										</span>
									)}
								</label>
							</div>

							{/* Row accounting, on screen: every uploaded row is visibly
						    somewhere, so nothing can go missing unnoticed. */}
							<dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
								<div>
									<dt className="text-xs text-muted-foreground">Rows in file</dt>
									<dd className="tnum font-semibold text-foreground">{result.inputRows.toLocaleString()}</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">Banks</dt>
									<dd className="tnum font-semibold text-foreground">{result.groups.length}</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">No bank code</dt>
									<dd
										className={cn(
											"tnum font-semibold",
											result.noCode.length > 0 ? "text-amber-600 dark:text-amber-300" : "text-foreground",
										)}
									>
										{result.noCode.length.toLocaleString()}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">Total value</dt>
									<dd className="tnum font-semibold text-foreground">{formatAmount(result.grandTotal)}</dd>
								</div>
							</dl>

							{!analysis?.balanced && (
								<p className="mt-3 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
									<AlertTriangle className="size-3.5" />
									Row accounting does not balance — do not send these files. Report this file.
								</p>
							)}
							{result.noCode.length > 0 && (
								<p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
									{result.noCode.length.toLocaleString()} row
									{result.noCode.length === 1 ? " has" : "s have"} no readable bank code and{" "}
									{result.noCode.length === 1 ? "is" : "are"} not in any file. Check the column above.
								</p>
							)}
						</Card>

						<UnmappedBanner groups={unmapped} onSave={saveOverride} />

						<ColumnPicker
							headers={preview.spool.headers}
							selected={selected}
							includeBankName={includeBankName}
							onToggle={toggle}
							onToggleBankName={() => setIncludeBankName((v) => !v)}
							onSelectAll={() => {
								setSelected([...preview.spool.headers]);
								setIncludeBankName(true);
							}}
							onSelectNone={() => {
								setSelected([]);
								setIncludeBankName(false);
							}}
						/>

						<section>
							<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
								<h2 className="text-sm font-semibold text-foreground">
									Beneficiary banks ({result.groups.length})
								</h2>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => void download("combined", "combined")}
										disabled={nothingSelected || downloading !== null}
									>
										{downloading === "combined" && <Loader2 className="animate-spin" />}
										{downloading === "combined" ? "Building…" : "Combined workbook"}
									</Button>
									<Button
										type="button"
										onClick={() => void download("zip", "zip")}
										disabled={nothingSelected || downloading !== null}
									>
										{downloading === "zip" && <Loader2 className="animate-spin" />}
										{downloading === "zip" ? "Building…" : "Download all (.zip)"}
									</Button>
								</div>
							</div>

							<BankGroupTable
								groups={result.groups}
								grandTotal={result.grandTotal}
								downloading={downloading}
								onDownload={(group: BankGroup) => void download(group.code, group.code)}
							/>
						</section>
					</div>
				)}
			</div>
		</div>
	);
}
