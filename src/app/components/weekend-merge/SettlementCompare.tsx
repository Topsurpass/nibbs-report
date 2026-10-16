"use client";

import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import CheckSummary from "@/app/components/CheckSummary";
import FileDropzone from "@/app/components/FileDropzone";
import { MISMATCH_LABELS, type ComparisonResult, type MismatchKind, type NamedText } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import RowDiffTable from "./RowDiffTable";

interface SettlementCompareProps {
	expectedName: string;
	settlement: NamedText | null;
	comparison: ComparisonResult | null;
	onSelect: (file: File) => void;
}

/** Step 3: drop Settlement's merged file and see every row checked against ours. */
export default function SettlementCompare({ expectedName, settlement, comparison, onSelect }: SettlementCompareProps) {
	const [onlyDiffs, setOnlyDiffs] = useState(false);
	const rows = comparison ? (onlyDiffs ? comparison.rows.filter((r) => !r.ok) : comparison.rows) : [];
	// File-like stand-in so FileDropzone can show the loaded name.
	const file = settlement ? ({ name: settlement.name } as File) : null;

	return (
		<div className="space-y-4">
			<FileDropzone
				title="Settlement's merged file"
				subtitle={`Expected name: ${expectedName}`}
				accept=".txt"
				accent="teal"
				file={file}
				summary={comparison ? `${comparison.rows.length} row(s) compared` : undefined}
				onSelect={onSelect}
			/>

			{comparison && (
				<div className="animate-in fade-in space-y-4 duration-300">
					<div className="flex flex-wrap items-center gap-3">
						<Badge
							className={cn(
								"gap-1.5 px-3 py-1.5 text-xs font-bold",
								comparison.pass
									? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
									: "bg-destructive/15 text-destructive",
							)}
						>
							{comparison.pass ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
							{comparison.pass
								? `FILES MATCH: ${comparison.matched} of ${comparison.rows.length} rows identical`
								: `MISMATCH: ${comparison.mismatched} of ${comparison.rows.length} rows differ`}
						</Badge>
						{(Object.keys(comparison.byKind) as MismatchKind[]).map((k) => (
							<Badge key={k} variant="outline" className="tnum">
								{MISMATCH_LABELS[k]}: {comparison.byKind[k]}
							</Badge>
						))}
					</div>

					<CheckSummary checks={comparison.checks} />

					<div className="flex items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">⇥ = tab · · = space</p>
						<div className="flex items-center gap-2">
							<Switch id="only-diffs" checked={onlyDiffs} onCheckedChange={setOnlyDiffs} />
							<Label htmlFor="only-diffs">Only show differences</Label>
						</div>
					</div>
					<RowDiffTable rows={rows} />
				</div>
			)}
		</div>
	);
}
