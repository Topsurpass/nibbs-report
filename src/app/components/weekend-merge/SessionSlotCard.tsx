"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Copy, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatKobo, type BoardSlot, type SlotState, type SourceFile } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";

const STATE: Record<SlotState, { card: string; icon: typeof CheckCircle2; iconCls: string; text: string }> = {
	ok: { card: "border-border bg-card", icon: CheckCircle2, iconCls: "text-success", text: "Ready" },
	warn: { card: "border-warning/40 bg-warning/5", icon: AlertTriangle, iconCls: "text-warning", text: "Check" },
	fail: { card: "border-destructive/40 bg-destructive/5", icon: XCircle, iconCls: "text-destructive", text: "Rejected" },
	duplicate: { card: "border-destructive/40 bg-destructive/5", icon: Copy, iconCls: "text-destructive", text: "Duplicate" },
	missing: { card: "border-dashed border-border bg-muted/30", icon: CircleDashed, iconCls: "text-muted-foreground", text: "Missing" },
};

interface SessionSlotCardProps {
	slot: BoardSlot;
	/** 1-based position in the merged file, when this slot will be merged. */
	order?: number;
	/** Missing, but the user chose to merge without it. */
	skipped?: boolean;
	onRemove: (id: string) => void;
}

function RemoveButton({ file, onRemove }: { file: SourceFile; onRemove: (id: string) => void }) {
	return (
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={`Remove ${file.name}`}
			className="text-muted-foreground hover:text-destructive"
			onClick={() => onRemove(file.id)}
		>
			<X />
		</Button>
	);
}

const SKIPPED = { card: "border-dashed border-warning/50 bg-warning/5", icon: CircleDashed, iconCls: "text-warning", text: "Skipped" };

/** One session (e.g. Saturday 2pm) on the board. */
export default function SessionSlotCard({ slot, order, skipped, onRemove }: SessionSlotCardProps) {
	const s = skipped ? SKIPPED : STATE[slot.state];
	const file = slot.files[0];
	const failures = file?.issues.filter((i) => i.severity === "fail") ?? [];
	const warnings = file?.issues.filter((i) => i.severity === "warn") ?? [];

	return (
		<li className={cn("flex min-h-32 flex-col rounded-xl border p-3 transition-shadow hover:shadow-sm", s.card)}>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-baseline gap-1.5">
					<span className="text-sm font-semibold text-foreground">{slot.label}</span>
					<span className="tnum text-[11px] text-muted-foreground">_{slot.session}</span>
				</div>
				<span className={cn("flex items-center gap-1 text-[11px] font-semibold", s.iconCls)}>
					<s.icon className="size-3.5" aria-hidden />
					{s.text}
				</span>
			</div>

			{slot.state === "missing" && (
				<div className="mt-2 space-y-1">
					<p className="text-xs text-muted-foreground">{skipped ? "Merging without this session" : "Not uploaded yet"}</p>
					<p className="tnum truncate text-[11px] text-muted-foreground/80" title={slot.expectedName}>
						{slot.expectedName}
					</p>
				</div>
			)}

			{slot.state === "duplicate" && (
				<div className="mt-2 space-y-1">
					<p className="text-xs font-medium text-destructive">Uploaded {slot.files.length} times. Remove the extra.</p>
					<ul className="space-y-0.5">
						{slot.files.map((f) => (
							<li key={f.id} className="flex items-center justify-between gap-1">
								<span className="tnum truncate text-[11px] text-foreground" title={f.name}>
									{f.name}
								</span>
								<RemoveButton file={f} onRemove={onRemove} />
							</li>
						))}
					</ul>
				</div>
			)}

			{file && slot.state !== "duplicate" && (
				<>
					<div className="mt-2 flex items-center justify-between gap-1">
						<span className="tnum truncate text-[11px] text-muted-foreground" title={file.name}>
							{file.name}
						</span>
						<RemoveButton file={file} onRemove={onRemove} />
					</div>
					<p className="tnum mt-0.5 text-xs text-foreground">
						{file.records.length} rows <span className="text-muted-foreground">·</span> net {formatKobo(file.sumKobo)}
					</p>
					{(failures.length > 0 || warnings.length > 0) && (
						<ul className="mt-2 space-y-1 text-[11px] leading-snug">
							{failures.map((i) => (
								<li key={i.message} className="text-destructive">
									{i.message}
								</li>
							))}
							{warnings.map((i) => (
								<li key={i.message} className="text-warning">
									{i.message}
								</li>
							))}
						</ul>
					)}
					{order !== undefined && (
						<span className="tnum mt-auto self-start pt-2 text-[11px] font-medium text-primary">Merge #{order}</span>
					)}
				</>
			)}
		</li>
	);
}
