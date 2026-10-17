"use client";

import { BANK_NAME_COLUMN } from "@/lib/escalation/types";
import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ColumnPickerProps {
	/** Headers found in the uploaded file, in their original order. */
	headers: string[];
	/** Currently checked headers (a subset of `headers`). */
	selected: string[];
	includeBankName: boolean;
	onToggle: (header: string) => void;
	onToggleBankName: () => void;
	onSelectAll: () => void;
	onSelectNone: () => void;
}

/**
 * Checkbox grid for choosing which columns land in the escalation files.
 *
 * Output always follows the file's own column order, never the order boxes were
 * ticked, so a bank always sees the layout it is used to.
 */
export default function ColumnPicker({
	headers,
	selected,
	includeBankName,
	onToggle,
	onToggleBankName,
	onSelectAll,
	onSelectNone,
}: ColumnPickerProps) {
	const checked = new Set(selected);
	const total = headers.length + 1;
	const count = selected.length + (includeBankName ? 1 : 0);

	return (
		<Card className="p-5">
			<CardHeader className="flex-row items-center justify-between gap-3 px-0">
				<div>
					<CardTitle>Columns in the escalation files</CardTitle>
					<CardDescription>
						{count} of {total} selected · written in the file&rsquo;s original order
					</CardDescription>
				</div>
				<CardAction className="row-start-1 flex gap-2 self-center">
					<Button type="button" variant="outline" size="sm" onClick={onSelectAll}>
						All
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onSelectNone}>
						None
					</Button>
				</CardAction>
			</CardHeader>

			<div className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
				<label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
					<Checkbox checked={includeBankName} onCheckedChange={onToggleBankName} />
					<span className="truncate font-medium" title={BANK_NAME_COLUMN}>
						{BANK_NAME_COLUMN}
					</span>
					<Badge className="shrink-0 bg-primary/15 text-[9px] text-primary">Added</Badge>
				</label>

				{headers.map((header) => (
					<label key={header} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
						<Checkbox checked={checked.has(header)} onCheckedChange={() => onToggle(header)} />
						<span className="truncate" title={header}>
							{header}
						</span>
					</label>
				))}
			</div>

			{count === 0 && (
				<Alert className="mt-4 border-warning/30 bg-warning/5">
					<AlertDescription className="text-warning">
						Nothing is selected — the files would be empty. Tick at least one column.
					</AlertDescription>
				</Alert>
			)}
		</Card>
	);
}
