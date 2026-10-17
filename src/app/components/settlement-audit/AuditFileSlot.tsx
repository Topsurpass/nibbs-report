"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Upload, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import DropOverlay from "@/app/components/DropOverlay";
import { useFileDrop } from "@/hooks/useFileDrop";
import { cn } from "@/lib/utils";

export type SlotStatus = "empty" | "ok" | "warn" | "error";

export interface SlotFact {
	label: string;
	value: string;
	tone?: "ok" | "warn" | "error";
}

interface AuditFileSlotProps {
	icon: LucideIcon;
	title: string;
	/** Where the file comes from. */
	source: string;
	/** An example of the expected file name. */
	example: string;
	accept: string;
	fileName: string | null;
	status: SlotStatus;
	facts: SlotFact[];
	message?: string;
	onFile: (file: File) => void;
}

const STATUS: Record<Exclude<SlotStatus, "empty">, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
	ok: { label: "Ready", cls: "bg-success/15 text-success", icon: CheckCircle2 },
	warn: { label: "Check", cls: "bg-warning/15 text-warning", icon: AlertTriangle },
	error: { label: "Problem", cls: "bg-destructive/15 text-destructive", icon: XCircle },
};

const FACT_TONE = { ok: "text-success", warn: "text-warning", error: "text-destructive" } as const;

/** One of the audit's two input files: a drop target that shows what it parsed. */
export default function AuditFileSlot({
	icon: Icon,
	title,
	source,
	example,
	accept,
	fileName,
	status,
	facts,
	message,
	onFile,
}: AuditFileSlotProps) {
	const { dragging, dragCount, open, dropProps, inputProps } = useFileDrop((files) => onFile(files[0]), {
		accept,
		multiple: false,
	});
	const s = status === "empty" ? null : STATUS[status];

	return (
		<div
			{...dropProps}
			className={cn(
				"relative flex flex-col gap-4 rounded-xl border bg-card p-4 transition-shadow",
				status === "error" ? "border-destructive/40" : status === "warn" ? "border-warning/40" : "border-border",
				status !== "empty" && "shadow-sm",
			)}
		>
			<input {...inputProps} />
			{dragging && <DropOverlay count={dragCount} label={fileName ? "to replace" : "to upload"} />}

			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Icon className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-foreground">{title}</p>
					<p className="text-xs text-muted-foreground">{source}</p>
				</div>
				{s && (
					<span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
						<s.icon className="size-3" />
						{s.label}
					</span>
				)}
			</div>

			{fileName ? (
				<>
					<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
						<p className="tnum min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={fileName}>
							{fileName}
						</p>
						<Button variant="ghost" size="sm" onClick={open}>
							<RefreshCw className="size-3.5" />
							Replace
						</Button>
					</div>
					{facts.length > 0 && (
						<dl className="grid grid-cols-2 gap-x-4 gap-y-2">
							{facts.map((f) => (
								<div key={f.label} className="min-w-0">
									<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</dt>
									<dd className={cn("tnum truncate text-sm font-medium text-foreground", f.tone && FACT_TONE[f.tone])} title={f.value}>
										{f.value}
									</dd>
								</div>
							))}
						</dl>
					)}
					{message && (
						<p
							className={cn(
								"rounded-lg px-3 py-2 text-xs",
								status === "error" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
							)}
						>
							{message}
						</p>
					)}
				</>
			) : (
				<button
					type="button"
					onClick={open}
					className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
				>
					<Upload className="size-5 text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">Drop the file here or choose one</span>
					<span className="tnum text-[11px] text-muted-foreground">e.g. {example}</span>
				</button>
			)}
		</div>
	);
}
