"use client";

import {
	formatDuration,
	formatLagosTime,
	formatNightLabel,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { entryMinutes, personName, sortEntries } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";

/**
 * Every night in the month as a list, newest first — the detail behind the
 * calendar, and what the workbook's "Nights" sheet mirrors.
 */

interface Props {
	entries: AttendanceEntry[];
	people: AttendancePerson[];
	/** Show who worked the night. Redundant on a single analyst's own register. */
	showAnalyst: boolean;
	onEdit?: (nightDate: NightDate, userId: string) => void;
}

export default function NightList({ entries, people, showAnalyst, onEdit }: Props) {
	const nameById = new Map(people.map((p) => [p.id, personName(p)]));
	const sorted = sortEntries(entries);

	if (sorted.length === 0) {
		return (
			<p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
				No nights recorded this month.
			</p>
		);
	}

	return (
		<ul className="divide-y divide-border">
			{sorted.map((entry) => {
				const minutes = entryMinutes(entry);
				return (
					<li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
						<div className="min-w-[9rem]">
							<p className="text-sm font-semibold text-foreground">
								{formatNightLabel(entry.nightDate)}
							</p>
							<p className="text-[11px] tabular-nums text-muted">{entry.nightDate}</p>
						</div>

						{showAnalyst && (
							<p className="min-w-[10rem] flex-1 text-sm text-foreground">
								{nameById.get(entry.userId) ?? "Unknown analyst"}
							</p>
						)}

						<p className="tabular-nums text-sm text-muted">
							{formatLagosTime(new Date(entry.signedInAt))}
							{" → "}
							{entry.signedOutAt ? formatLagosTime(new Date(entry.signedOutAt)) : "—"}
						</p>

						<span
							className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
								minutes === null
									? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
									: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
							}`}
						>
							{minutes === null ? "Still open" : formatDuration(minutes)}
						</span>

						{entry.source === "admin" && (
							<span
								title={entry.note ?? "Added by an admin"}
								className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
							>
								Admin entry
							</span>
						)}

						{onEdit && (
							<button
								type="button"
								onClick={() => onEdit(entry.nightDate, entry.userId)}
								className="ml-auto rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
							>
								Edit
							</button>
						)}
					</li>
				);
			})}
		</ul>
	);
}
