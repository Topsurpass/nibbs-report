"use client";

import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SESSION_LABELS } from "@/lib/session/nibbsSession";
import type { SessionNo } from "@/lib/weekendMerge";

const SESSION_ITEMS = Object.fromEntries(SESSION_LABELS.map((label, i) => [String(i + 1), `_${i + 1} · ${label}`]));

interface MergeControlsProps {
	mergeDate: string;
	isDefaultDate: boolean;
	onMergeDateChange: (v: string | null) => void;
	session: SessionNo;
	onSessionChange: (v: SessionNo) => void;
	fileName: string | null;
	downloadable: boolean;
	onDownload: () => void;
}

/** Merge date + session pickers, output filename preview and the download action. */
export default function MergeControls({
	mergeDate,
	isDefaultDate,
	onMergeDateChange,
	session,
	onSessionChange,
	fileName,
	downloadable,
	onDownload,
}: MergeControlsProps) {
	return (
		<div className="flex flex-wrap items-end gap-4">
			<div className="space-y-1.5">
				<Label htmlFor="merge-date">Merge date</Label>
				<div className="flex items-center gap-1">
					<Input
						id="merge-date"
						type="date"
						className="w-44"
						value={mergeDate}
						onChange={(e) => onMergeDateChange(e.target.value || null)}
					/>
					{!isDefaultDate && (
						<Button variant="ghost" size="icon-sm" aria-label="Use next business day" onClick={() => onMergeDateChange(null)}>
							<RotateCcw className="size-4" />
						</Button>
					)}
				</div>
				<p className="text-[11px] text-muted-foreground">
					{isDefaultDate ? "Next business day after the last file" : "Custom date"}
				</p>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="merge-session">Session</Label>
				<Select items={SESSION_ITEMS} value={String(session)} onValueChange={(v) => v && onSessionChange(Number(v) as SessionNo)}>
					<SelectTrigger id="merge-session" className="w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(SESSION_ITEMS).map(([value, label]) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-[11px] text-muted-foreground">Default _1 (morning)</p>
			</div>
			<div className="min-w-0 flex-1 space-y-1.5">
				<p className="text-sm font-medium text-foreground">Output file</p>
				<p className="tnum truncate rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-semibold">
					{fileName ?? "—"}
				</p>
				<p className="text-[11px] text-muted-foreground">CRLF line endings, no trailing newline</p>
			</div>
			<Button size="lg" onClick={onDownload} disabled={!downloadable} className="mb-5">
				<Download className="size-4" />
				Download merged file
			</Button>
		</div>
	);
}
