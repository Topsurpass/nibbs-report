"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
	formatDuration,
	formatLagosTime,
	formatNightLabel,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { SHIFT_META, type Shift } from "@/lib/attendance/shifts";
import { entryMinutes, groupNights, personName } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";
import { paginate } from "@/lib/paginate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Every night in the month, newest first — the detail behind the calendar.
 *
 * Paged by *night*, never by row, so a night with six analysts is never split
 * across a page break. On the team register the analysts who worked a night are
 * grouped under it, because the question that view answers is "how many were on
 * last night", and a flat list makes that a counting exercise.
 */

interface Props {
	/** Labels rows "night" or "afternoon". */
	shift: Shift;
	entries: AttendanceEntry[];
	people: AttendancePerson[];
	/** Show who worked the night. Redundant on a single analyst's own register. */
	showAnalyst: boolean;
	onEdit?: (nightDate: NightDate, userId: string) => void;
	/** Admin-only. Removing a night is destructive, so it asks first. */
	onRemove?: (entry: AttendanceEntry) => void;
	/** The night currently being deleted, so its row can show progress. */
	removingId?: string | null;
	/** Changing this resets to page 1 — a new month must not open mid-list. */
	resetKey: string;
}

const NIGHTS_PER_PAGE = 8;

function DurationBadge({ minutes }: { minutes: number | null }) {
	return (
		<Badge
			className={cn(
				"tnum shrink-0",
				minutes === null
					? "bg-warning/15 text-warning"
					: "bg-success/15 text-success",
			)}
		>
			{minutes === null ? "Still open" : formatDuration(minutes)}
		</Badge>
	);
}

export default function NightList({
	shift,
	entries,
	people,
	showAnalyst,
	onEdit,
	onRemove,
	removingId,
	resetKey,
}: Props) {
	const nameById = useMemo(() => new Map(people.map((p) => [p.id, personName(p)])), [people]);
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
			<p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
				No {SHIFT_META[shift].plural.toLowerCase()} recorded this month.
			</p>
		);
	}

	return (
		<div>
			<ul className="divide-y divide-border">
				{view.items.map((group) => {
					const count = group.entries.length;

					return (
						<li key={group.nightDate} className="py-3">
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<div className="min-w-[9rem]">
									<p className="text-sm font-semibold text-foreground">{formatNightLabel(group.nightDate)}</p>
									<p className="tnum text-[11px] text-muted-foreground">{group.nightDate}</p>
								</div>

								{showAnalyst && (
									<Badge
										variant="secondary"
										className={cn(count > 1 && "bg-primary/15 text-primary")}
									>
										{count} on duty
									</Badge>
								)}

								{/* One analyst's own register has a single row per night, so the
								    times sit on the heading line instead of below it. */}
								{!showAnalyst && (
									<>
										<p className="tnum text-sm text-muted-foreground">
											{formatLagosTime(new Date(group.entries[0].signedInAt))}
											{" → "}
											{group.entries[0].signedOutAt
												? formatLagosTime(new Date(group.entries[0].signedOutAt))
												: "—"}
										</p>
										<DurationBadge minutes={entryMinutes(group.entries[0])} />
										{group.entries[0].source === "admin" && (
											<Badge
												variant="secondary"
												className="bg-primary/15 text-primary"
												title={group.entries[0].note ?? "Added by an admin"}
											>
												Admin entry
											</Badge>
										)}
									</>
								)}

								{!showAnalyst && (onEdit || onRemove) && (
									<div className="ml-auto flex gap-2">
										{onEdit && (
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => onEdit(group.nightDate, group.entries[0].userId)}
											>
												Edit
											</Button>
										)}
										{onRemove && (
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => onRemove(group.entries[0])}
												disabled={removingId === group.entries[0].id}
												className="border-destructive/40 text-destructive hover:bg-destructive/10"
											>
												{removingId === group.entries[0].id && <Loader2 className="animate-spin" />}
												{removingId === group.entries[0].id ? "Removing…" : "Remove"}
											</Button>
										)}
									</div>
								)}
							</div>

							{showAnalyst && (
								<ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
									{group.entries.map((entry) => (
										<li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
											<span className="min-w-[10rem] flex-1 text-foreground">
												{nameById.get(entry.userId) ?? "Unknown analyst"}
											</span>

											<span className="tnum text-muted-foreground">
												{formatLagosTime(new Date(entry.signedInAt))}
												{" → "}
												{entry.signedOutAt ? formatLagosTime(new Date(entry.signedOutAt)) : "—"}
											</span>

											<DurationBadge minutes={entryMinutes(entry)} />

											{entry.source === "admin" && (
												<Badge
													variant="secondary"
													className="bg-primary/15 text-primary"
													title={entry.note ?? "Added by an admin"}
												>
													Admin entry
												</Badge>
											)}

											{onEdit && (
												<Button type="button" variant="outline" size="sm" onClick={() => onEdit(entry.nightDate, entry.userId)}>
													Edit
												</Button>
											)}

											{/* Wrong sign-in, a duplicate, or somebody testing the
											    button: an admin takes the row off the register here
											    rather than opening the dialog first. */}
											{onRemove && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => onRemove(entry)}
													disabled={removingId === entry.id}
													aria-label={`Remove ${nameById.get(entry.userId) ?? "analyst"}'s ${SHIFT_META[shift].noun} of ${entry.nightDate}`}
													className="border-destructive/40 text-destructive hover:bg-destructive/10"
												>
													{removingId === entry.id && <Loader2 className="animate-spin" />}
													{removingId === entry.id ? "Removing…" : "Remove"}
												</Button>
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
					<p className="text-xs text-muted-foreground">
						{SHIFT_META[shift].plural} {view.from}–{view.to} of {view.total}
					</p>
					<div className="ml-auto flex items-center gap-2">
						<Button type="button" variant="outline" size="sm" onClick={() => setPage(view.page - 1)} disabled={!view.hasPrevious}>
							<ChevronLeft className="size-3.5" />
							Newer
						</Button>
						<span className="tnum text-xs text-muted-foreground">
							Page {view.page} of {view.pageCount}
						</span>
						<Button type="button" variant="outline" size="sm" onClick={() => setPage(view.page + 1)} disabled={!view.hasNext}>
							Older
							<ChevronRight className="size-3.5" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
