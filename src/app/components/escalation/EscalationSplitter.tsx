"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Compass, ShieldAlert } from "lucide-react";
import PageHeader from "@/app/components/layout/PageHeader";
import BankGroupTable from "./BankGroupTable";
import EscalationSummaryPanel from "./EscalationSummaryPanel";
import SpoolDropHero from "./SpoolDropHero";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
				eyebrow="Operations"
				title="Fraud Escalation"
				description="Turn a spooled fraudulent-transaction file into one escalation workbook per beneficiary bank, ready to send for lien placement."
				actions={
					/* Replay: the tour auto-shows once, but it has to stay
					    reachable afterwards or it may as well not exist. */
					<Button type="button" variant="outline" onClick={tour.replay}>
						<Compass className="size-4" />
						Show me around
					</Button>
				}
			/>

			{!preview || !result || !file ? (
				<SpoolDropHero reading={reading} error={error || null} onFile={(picked) => void onSelect(picked)} />
			) : (
				// One grid: narrow screens read setup → pack → banks; xl keeps the
				// pack (accounting + downloads) in a sticky right column.
				<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
					{/* Bank-code column: always visible and always overridable. Getting
					    this wrong escalates to the sending bank instead of the receiving
					    one, so it is never a silent decision. */}
					<Card className="xl:col-start-1">
						<CardHeader>
							<CardTitle>Beneficiary bank code</CardTitle>
							<CardDescription>
								Confirm this is the <strong className="text-foreground">beneficiary</strong> column, not the sender.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex flex-wrap items-center gap-4">
								<div className="min-w-60 flex-1">
									<Select
										value={preview.codeColumn}
										onValueChange={(column) => {
											if (!column) return;
											const match = candidates.find((c) => c.column === column);
											setPreview((p) => (p ? { ...p, codeColumn: column, codeMode: match?.mode ?? "direct" } : p));
										}}
									>
										<SelectTrigger id="code-column" aria-label="Beneficiary bank-code column" className="w-full">
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
								</div>
								<label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
									<Checkbox checked={successfulOnly} onCheckedChange={() => setSuccessfulOnly((v) => !v)} />
									Successful only
									{result.filteredOut > 0 && (
										<span className="text-xs text-muted-foreground">
											({result.filteredOut.toLocaleString()} hidden)
										</span>
									)}
								</label>
							</div>
							{result.noCode.length > 0 && (
								<p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
									{result.noCode.length.toLocaleString()} row
									{result.noCode.length === 1 ? " has" : "s have"} no readable bank code and{" "}
									{result.noCode.length === 1 ? "is" : "are"} not in any file. Check the column above.
								</p>
							)}
						</CardContent>
					</Card>

					<EscalationSummaryPanel
						className="xl:sticky xl:top-20 xl:col-start-2 xl:row-span-2 xl:row-start-1"
						fileName={file.name}
						sheetName={preview.spool.sheetName}
						rowsInFile={result.inputRows}
						banks={result.groups.length}
						noCode={result.noCode.length}
						totalValue={formatAmount(result.grandTotal)}
						balanced={Boolean(analysis?.balanced)}
						nothingSelected={nothingSelected}
						downloading={downloading}
						onReplace={(picked) => void onSelect(picked)}
						onDownloadZip={() => void download("zip", "zip")}
						onDownloadCombined={() => void download("combined", "combined")}
					/>

					<div className="min-w-0 space-y-6 xl:col-start-1">
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

						<section className="space-y-3">
							<div>
								<h2 className="text-base font-semibold text-foreground">Beneficiary banks ({result.groups.length})</h2>
								<p className="text-sm text-muted-foreground">Download a single bank&rsquo;s workbook from its row.</p>
							</div>
							<BankGroupTable
								groups={result.groups}
								grandTotal={result.grandTotal}
								downloading={downloading}
								onDownload={(group: BankGroup) => void download(group.code, group.code)}
							/>
						</section>
					</div>
				</div>
			)}
		</div>
	);
}
