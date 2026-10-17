"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Package, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useFileDrop } from "@/hooks/useFileDrop";
import { cn } from "@/lib/utils";

interface EscalationSummaryPanelProps {
	fileName: string;
	sheetName: string;
	rowsInFile: number;
	banks: number;
	noCode: number;
	totalValue: string;
	balanced: boolean;
	nothingSelected: boolean;
	downloading: string | null;
	onReplace: (file: File) => void;
	onDownloadZip: () => void;
	onDownloadCombined: () => void;
	className?: string;
}

/** The spool's row accounting and the download actions, kept in view. */
export default function EscalationSummaryPanel({
	fileName,
	sheetName,
	rowsInFile,
	banks,
	noCode,
	totalValue,
	balanced,
	nothingSelected,
	downloading,
	onReplace,
	onDownloadZip,
	onDownloadCombined,
	className,
}: EscalationSummaryPanelProps) {
	const { open, inputProps } = useFileDrop((files) => onReplace(files[0]), { accept: ".xlsx,.xls,.csv", multiple: false });
	const stats: { label: string; value: string; tone?: string }[] = [
		{ label: "Rows in file", value: rowsInFile.toLocaleString() },
		{ label: "Beneficiary banks", value: String(banks) },
		{ label: "No bank code", value: noCode.toLocaleString(), tone: noCode > 0 ? "text-warning" : undefined },
		{ label: "Total value", value: totalValue },
	];

	return (
		<Card className={cn("gap-4", className)}>
			<input {...inputProps} />
			<CardHeader>
				<CardTitle>Escalation pack</CardTitle>
				<CardDescription>One workbook per beneficiary bank</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/15 text-brand-teal">
						<FileSpreadsheet className="size-4.5" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="tnum truncate text-sm font-semibold text-foreground" title={fileName}>
							{fileName}
						</p>
						<p className="truncate text-[11px] text-muted-foreground">Sheet &ldquo;{sheetName}&rdquo;</p>
					</div>
					<Button variant="ghost" size="icon-sm" aria-label="Replace file" onClick={open}>
						<RefreshCw className="size-4" />
					</Button>
				</div>

				<dl>
					{stats.map((s) => (
						<div key={s.label} className="flex items-center justify-between gap-3 py-1.5">
							<dt className="text-sm text-muted-foreground">{s.label}</dt>
							<dd className={cn("tnum text-sm font-semibold text-foreground", s.tone)}>{s.value}</dd>
						</div>
					))}
				</dl>

				<p
					className={cn(
						"flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium",
						balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
					)}
				>
					{balanced ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
					{balanced
						? "Every row is accounted for: in a bank file, filtered out, or flagged with no code."
						: "Row accounting does not balance. Do not send these files; report this spool."}
				</p>

				<Separator />

				<div className="space-y-2">
					<Button size="lg" className="w-full" onClick={onDownloadZip} disabled={nothingSelected || downloading !== null}>
						{downloading === "zip" ? <Loader2 className="animate-spin" /> : <Package className="size-4" />}
						{downloading === "zip" ? "Building…" : "Download all (.zip)"}
					</Button>
					<Button
						variant="outline"
						className="w-full"
						onClick={onDownloadCombined}
						disabled={nothingSelected || downloading !== null}
					>
						{downloading === "combined" ? <Loader2 className="animate-spin" /> : <Download className="size-4" />}
						{downloading === "combined" ? "Building…" : "Combined workbook"}
					</Button>
					{nothingSelected && (
						<p className="text-center text-[11px] text-warning">Pick at least one column to include.</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
