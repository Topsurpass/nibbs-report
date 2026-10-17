"use client";

import { useMemo } from "react";
import {
	buildMonthGrid,
	formatDuration,
	formatLagosTime,
	toLagos,
	type MonthKey,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { SHIFT_META, activeDutyDate, shiftHoursSummary, type Shift } from "@/lib/attendance/shifts";
import { entryMinutes, indexByNight } from "@/lib/attendance/summary";
import type { AttendanceEntry } from "@/lib/attendance/types";
import { cn } from "@/lib/utils";

/**
 * A month of nights, laid out Monday-first.
 *
 * Cells are keyed by *night*, not by timestamp: the square for the 4th covers
 * 20:30 on the 4th through 08:30 on the 5th, which is why a 02:00 sign-in shows
 * up on the 4th and not the 5th. `buildMonthGrid` owns the layout and is unit
 * tested, so this component only paints.
 */

interface Props {
	/** Which shift's entries these are; decides "tonight" vs "today" and the footnote. */
	shift: Shift;
	month: MonthKey;
	entries: AttendanceEntry[];
	/** "me" shows hours per night; "all" shows how many analysts signed in. */
	scope: "me" | "all";
	/** Admins can click a night to add or correct it. */
	onPickNight?: (nightDate: NightDate) => void;
	/** Current time, for highlighting tonight. Null until the client clock ticks. */
	now: Date | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AttendanceCalendar({ shift, month, entries, scope, onPickNight, now }: Props) {
	const weeks = useMemo(() => buildMonthGrid(month), [month]);
	const byNight = useMemo(() => indexByNight(entries), [entries]);
	// The highlighted day: the running shift's date, or today for afternoons.
	const tonight = now ? (activeDutyDate(shift, now) ?? (shift === "afternoon" ? toLagos(now).date : null)) : null;
	const meta = SHIFT_META[shift];

	return (
		<div>
			<div className="grid grid-cols-7 gap-1.5 pb-2">
				{WEEKDAYS.map((day) => (
					<div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						{day}
					</div>
				))}
			</div>

			<div className="grid grid-cols-7 gap-1.5">
				{weeks.flat().map((day) => {
					const nights = byNight.get(day.date) ?? [];
					const worked = nights.length > 0;
					const isTonight = day.date === tonight;
					const dayNumber = Number(day.date.slice(8));

					const tone = !day.inMonth
						? "border-transparent bg-transparent text-muted-foreground/40"
						: worked
							? "border-success/40 bg-success/10 text-foreground"
							: "border-border bg-background text-muted-foreground";

					const label = `${day.date}${worked ? `, ${nights.length} sign-in${nights.length === 1 ? "" : "s"}` : ", no sign-in"}`;

					const content = (
						<>
							<span className={cn("text-xs font-semibold tabular-nums", isTonight && "text-primary")}>
								{dayNumber}
							</span>

							{day.inMonth && worked && scope === "me" && (
								<span className="mt-auto text-[10px] leading-tight">
									<span className="block font-semibold text-success">
										{formatLagosTime(new Date(nights[0].signedInAt))}
									</span>
									<span className="block text-muted-foreground">
										{nights[0].signedOutAt ? formatDuration(entryMinutes(nights[0])) : "open"}
									</span>
								</span>
							)}

							{day.inMonth && worked && scope === "all" && (
								<span className="mt-auto inline-flex w-fit items-center rounded-full bg-success px-1.5 py-0.5 text-[10px] font-bold text-success-foreground">
									{nights.length}
								</span>
							)}
						</>
					);

					const cellCls = cn(
						"relative flex min-h-[72px] flex-col rounded-xl border p-1.5 text-left transition-colors",
						tone,
						isTonight && "ring-2 ring-primary ring-offset-1 ring-offset-card",
						onPickNight && "cursor-pointer hover:border-primary/60",
					);

					if (onPickNight && day.inMonth) {
						return (
							<button
								key={day.date}
								type="button"
								onClick={() => onPickNight(day.date)}
								aria-label={`${label}. Add or correct this ${meta.noun}.`}
								className={cellCls}
							>
								{content}
							</button>
						);
					}

					return (
						<div key={day.date} aria-label={day.inMonth ? label : undefined} className={cellCls}>
							{content}
						</div>
					);
				})}
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<span className="size-2.5 rounded-sm border border-success/40 bg-success/20" />
					Signed in
				</span>
				<span className="flex items-center gap-1.5">
					<span className="size-2.5 rounded-sm border border-border bg-background" />
					No sign-in
				</span>
				<span className="flex items-center gap-1.5">
					<span className="size-2.5 rounded-sm ring-2 ring-primary" />
					{shift === "night" ? "Tonight" : "Today"}
				</span>
				<span className="ml-auto">
					{shift === "night"
						? "A night runs 20:30 → 08:30 and is shown on the day it started."
						: `An ${meta.noun} runs ${shiftHoursSummary(shift)}.`}
				</span>
			</div>
		</div>
	);
}
