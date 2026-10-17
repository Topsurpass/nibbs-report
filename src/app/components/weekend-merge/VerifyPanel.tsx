"use client";

import { useState } from "react";
import { CheckCircle2, FileSearch, FileSpreadsheet, Loader2, RefreshCw, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CheckList from "@/app/components/CheckList";
import { useFileDrop } from "@/hooks/useFileDrop";
import { MISMATCH_LABELS, type ComparisonResult, type MismatchKind, type NamedText } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import DropOverlay from "@/app/components/DropOverlay";
import RowDiffTable from "./RowDiffTable";

interface VerifyPanelProps {
	expectedName: string;
	settlement: NamedText | null;
	comparison: ComparisonResult | null;
	onFile: (file: File) => void;
	onClear: () => void;
	/** Build and save the side-by-side discrepancy workbook. */
	onDownloadReport: () => Promise<void>;
}

/** Drop Settlement's merged file and see every row checked against ours. */
export default function VerifyPanel({
	expectedName,
	settlement,
	comparison,
	onFile,
	onClear,
	onDownloadReport,
}: VerifyPanelProps) {
	const [building, setBuilding] = useState(false);
	const [reportError, setReportError] = useState<string | null>(null);
	const saveReport = async () => {
		setBuilding(true);
		setReportError(null);
		try {
			await onDownloadReport();
		} catch (err) {
			setReportError(err instanceof Error ? err.message : "Couldn't build the workbook.");
		} finally {
			setBuilding(false);
		}
	};
	const { dragging, dragCount, open, dropProps, inputProps } = useFileDrop((files) => onFile(files[0]), {
		accept: ".txt",
		multiple: false,
	});
	const [view, setView] = useState<"diff" | "all" | null>(null);

	if (!settlement || !comparison) {
		return (
			<div
				{...dropProps}
				className="relative flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center"
			>
				<input {...inputProps} />
				{dragging && <DropOverlay count={dragCount} label="to compare" />}
				<div className="flex size-12 items-center justify-center rounded-xl bg-brand-teal/15 text-brand-teal">
					<FileSearch className="size-6" />
				</div>
				<div className="space-y-1">
					<p className="text-sm font-semibold text-foreground">Drop Settlement&rsquo;s merged file</p>
					<p className="text-xs text-muted-foreground">
						It should be named <span className="tnum font-medium text-foreground">{expectedName}</span>
					</p>
				</div>
				<Button variant="outline" onClick={open}>
					<Upload className="size-4" />
					Choose file
				</Button>
			</div>
		);
	}

	const effectiveView = view ?? (comparison.mismatched > 0 ? "diff" : "all");
	const rows = effectiveView === "diff" ? comparison.rows.filter((r) => !r.ok) : comparison.rows;
	const kinds = Object.keys(comparison.byKind) as MismatchKind[];

	return (
		<div className="space-y-5" {...dropProps}>
			<input {...inputProps} />

			<div
				className={cn(
					"relative flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between",
					comparison.pass ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
				)}
			>
				{dragging && <DropOverlay count={dragCount} label="to replace" />}
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex size-10 shrink-0 items-center justify-center rounded-full",
							comparison.pass ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
						)}
					>
						{comparison.pass ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
					</div>
					<div className="space-y-1">
						<p className="text-base font-semibold text-foreground">
							{comparison.pass
								? "Settlement's file matches ours"
								: `${comparison.mismatched} of ${comparison.rows.length} rows differ`}
						</p>
						<p className="text-sm text-muted-foreground">
							{comparison.pass
								? `All ${comparison.matched} rows are identical, including tabs, dates and line endings.`
								: "Highlighted below: exactly which field or separator is wrong on each row."}
						</p>
						{kinds.length > 0 && (
							<div className="flex flex-wrap gap-1.5 pt-1">
								{kinds.map((k) => (
									<span key={k} className="tnum rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
										{MISMATCH_LABELS[k]} · {comparison.byKind[k]}
									</span>
								))}
							</div>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="tnum hidden max-w-56 truncate text-xs text-muted-foreground lg:inline" title={settlement.name}>
						{settlement.name}
					</span>
					<Button variant="outline" size="sm" onClick={open}>
						<RefreshCw className="size-3.5" />
						Replace
					</Button>
					<Button variant="ghost" size="icon-sm" aria-label="Remove Settlement's file" onClick={onClear}>
						<X className="size-4" />
					</Button>
				</div>
			</div>

			<div
				className={cn(
					"flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
					comparison.pass ? "border-border bg-card" : "border-primary/30 bg-primary/5",
				)}
			>
				<div className="flex items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<FileSpreadsheet className="size-5" />
					</div>
					<div className="space-y-0.5">
						<p className="text-sm font-semibold text-foreground">
							{comparison.pass ? "Comparison workbook" : "Send the discrepancy report to Settlement"}
						</p>
						<p className="text-xs text-muted-foreground">
							Excel with our compilation next to theirs, line by line in merge order, every wrong field in red and
							what to fix on each line.
						</p>
						{reportError && <p className="text-xs font-medium text-destructive">{reportError}</p>}
					</div>
				</div>
				<Button
					className="shrink-0 sm:ml-auto"
					variant={comparison.pass ? "outline" : "default"}
					onClick={() => void saveReport()}
					disabled={building}
				>
					{building ? <Loader2 className="animate-spin" /> : <FileSpreadsheet className="size-4" />}
					{building ? "Building…" : "Download .xlsx"}
				</Button>
			</div>

			<CheckList checks={comparison.checks} />

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div role="tablist" aria-label="Rows to show" className="inline-flex rounded-lg bg-muted p-0.5">
					{(
						[
							["diff", `Differences (${comparison.mismatched})`],
							["all", `All rows (${comparison.rows.length})`],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							role="tab"
							type="button"
							aria-selected={effectiveView === key}
							onClick={() => setView(key)}
							className={cn(
								"rounded-md px-3 py-1 text-xs font-medium transition-colors",
								effectiveView === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</div>
				<p className="text-xs text-muted-foreground">
					<span className="tnum">⇥</span> tab · <span className="tnum">·</span> space
				</p>
			</div>

			<RowDiffTable rows={rows} />
		</div>
	);
}
