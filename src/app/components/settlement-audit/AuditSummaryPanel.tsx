"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface SummaryStat {
	label: string;
	value: string | number;
	tone?: "success" | "danger" | "warning";
}

interface AuditSummaryPanelProps {
	stats: SummaryStat[];
	onDownload: () => void;
	className?: string;
}

const TONE = { success: "text-success", danger: "text-destructive", warning: "text-warning" } as const;

/** Key figures of the audit and the workbook download, kept in view. */
export default function AuditSummaryPanel({ stats, onDownload, className }: AuditSummaryPanelProps) {
	return (
		<Card className={cn("no-print gap-4", className)}>
			<CardHeader>
				<CardTitle>Audit summary</CardTitle>
				<CardDescription>Key figures for this session</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<dl>
					{stats.map((s) => (
						<div key={s.label} className="flex items-center justify-between gap-3 py-1.5">
							<dt className="text-sm text-muted-foreground">{s.label}</dt>
							<dd className={cn("tnum text-sm font-semibold text-foreground", s.tone && TONE[s.tone])}>{s.value}</dd>
						</div>
					))}
				</dl>
				<Separator />
				<Button size="lg" className="w-full" onClick={onDownload}>
					<Download className="size-4" />
					Download Excel report
				</Button>
				<p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
					<FileSpreadsheet className="size-3.5" />
					Summary, reconciliation and breaches sheets
				</p>
			</CardContent>
		</Card>
	);
}
