"use client";

import { BANK_NAME_COLUMN } from "@/lib/escalation/types";

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
		<section className="rounded-2xl border border-border bg-surface p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-sm font-semibold text-foreground">Columns in the escalation files</h2>
					<p className="mt-0.5 text-xs text-muted">
						{count} of {total} selected · written in the file&rsquo;s original order
					</p>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={onSelectAll}
						className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
					>
						All
					</button>
					<button
						type="button"
						onClick={onSelectNone}
						className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
					>
						None
					</button>
				</div>
			</div>

			<div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
				<label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						checked={includeBankName}
						onChange={onToggleBankName}
						className="h-4 w-4 shrink-0 accent-indigo-600"
					/>
					<span className="truncate font-medium" title={BANK_NAME_COLUMN}>
						{BANK_NAME_COLUMN}
					</span>
					<span className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
						Added
					</span>
				</label>

				{headers.map((header) => (
					<label
						key={header}
						className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
					>
						<input
							type="checkbox"
							checked={checked.has(header)}
							onChange={() => onToggle(header)}
							className="h-4 w-4 shrink-0 accent-indigo-600"
						/>
						<span className="truncate" title={header}>
							{header}
						</span>
					</label>
				))}
			</div>

			{count === 0 && (
				<p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
					Nothing is selected — the files would be empty. Tick at least one column.
				</p>
			)}
		</section>
	);
}
