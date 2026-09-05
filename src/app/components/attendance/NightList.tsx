"use client";

import { useMemo, useState } from "react";
import {
	formatDuration,
	formatLagosTime,
	formatNightLabel,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { entryMinutes, groupNights, personName } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";
import { paginate } from "@/lib/paginate";

/**
 * Every night in the month, newest first — the detail behind the calendar.
 *
 * Paged by *night*, never by row, so a night with six analysts is never split
 * across a page break. On the team register the analysts who worked a night are
 * grouped under it, because the question that view answers is "how many were on
 * last night", and a flat list makes that a counting exercise.
 */

interface Props {
	entries: AttendanceEntry[];
	people: AttendancePerson[];
	/** Show who worked the night. Redundant on a single analyst's own register. */
	showAnalyst: boolean;
	onEdit?: (nightDate: NightDate, userId: string) => void;
	/** Changing this resets to page 1 — a new month must not open mid-list. */
	resetKey: string;
}

const NIGHTS_PER_PAGE = 8;

function DurationBadge({ minutes }: { minutes: number | null }) {
	return (
		<span
			className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
				minutes === null
					? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
					: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
			}`}
		>
			{minutes === null ? "Still open" : formatDuration(minutes)}
		</span>
	);
}

export default function NightList({ entries, people, showAnalyst, onEdit, resetKey }: Props) {
	const nameById = useMemo(
		() => new Map(people.map((p) => [p.id, personName(p)])),
		[people],
	);
	const groups = useMemo(() => groupNights(entries), [entries]);

	const [page, setPage] = useState(1);

	// Reset during render rather than in an effect, so no frame shows page 4 of a
	// month that only has one page.
	const [seenKey, setSeenKey] = useState(resetKey);
	if (seenKey !== resetKey) {
		setSeenKey(resetKey);
		setPage(1);
	}

	// `paginate` clamps, so a page left over from a longer month lands on the last
	// page here rather than rendering blank.
	const view = paginate(groups, page, NIGHTS_PER_PAGE);

	if (groups.length === 0) {
		return (
			<p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
				No nights recorded this month.
			</p>
		);
	}

	const control =
		"rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5";

	return (
		<div>
			<ul className="divide-y divide-border">
				{view.items.map((group) => {
					const count = group.entries.length;

					return (
						<li key={group.nightDate} className="py-3">
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<div className="min-w-[9rem]">
									<p className="text-sm font-semibold text-foreground">
										{formatNightLabel(group.nightDate)}
									</p>
									<p className="text-[11px] tabular-nums text-muted">{group.nightDate}</p>
								</div>

								{showAnalyst && (
									<span
										className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
											count > 1
												? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
												: "bg-black/5 text-muted dark:bg-white/10"
										}`}
									>
										{count} on duty
									</span>
								)}

								{/* One analyst's own register has a single row per night, so the
								    times sit on the heading line instead of below it. */}
								{!showAnalyst && (
									<>
										<p className="tabular-nums text-sm text-muted">
											{formatLagosTime(new Date(group.entries[0].signedInAt))}
											{" → "}
											{group.entries[0].signedOutAt
												? formatLagosTime(new Date(group.entries[0].signedOutAt))
												: "—"}
										</p>
										<DurationBadge minutes={entryMinutes(group.entries[0])} />
										{group.entries[0].source === "admin" && (
											<span
												title={group.entries[0].note ?? "Added by an admin"}
												className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
											>
												Admin entry
											</span>
										)}
									</>
								)}

								{onEdit && !showAnalyst && (
									<button
										type="button"
										onClick={() => onEdit(group.nightDate, group.entries[0].userId)}
										className="ml-auto rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
									>
										Edit
									</button>
								)}
							</div>

							{showAnalyst && (
								<ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
									{group.entries.map((entry) => (
										<li
											key={entry.id}
											className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
										>
											<span className="min-w-[10rem] flex-1 text-foreground">
												{nameById.get(entry.userId) ?? "Unknown analyst"}
											</span>

											<span className="tabular-nums text-muted">
												{formatLagosTime(new Date(entry.signedInAt))}
												{" → "}
												{entry.signedOutAt ? formatLagosTime(new Date(entry.signedOutAt)) : "—"}
											</span>

											<DurationBadge minutes={entryMinutes(entry)} />

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
													className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
												>
													Edit
												</button>
											)}
										</li>
									))}
								</ul>
							)}
						</li>
					);
				})}
			</ul>

			{view.pageCount > 1 && (
				<div className="flex flex-wrap items-center gap-3 border-t border-border py-3">
					<p className="text-xs text-muted">
						Nights {view.from}–{view.to} of {view.total}
					</p>
					<div className="ml-auto flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPage(view.page - 1)}
							disabled={!view.hasPrevious}
							className={control}
						>
							← Newer
						</button>
						<span className="text-xs tabular-nums text-muted">
							Page {view.page} of {view.pageCount}
						</span>
						<button
							type="button"
							onClick={() => setPage(view.page + 1)}
							disabled={!view.hasNext}
							className={control}
						>
							Older →
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
