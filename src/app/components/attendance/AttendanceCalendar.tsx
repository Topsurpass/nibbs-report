"use client";

import { useMemo } from "react";
import {
	buildMonthGrid,
	formatDuration,
	formatLagosTime,
	nightDateFor,
	type MonthKey,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { entryMinutes, indexByNight } from "@/lib/attendance/summary";
import type { AttendanceEntry } from "@/lib/attendance/types";

/**
 * A month of nights, laid out Monday-first.
 *
 * Cells are keyed by *night*, not by timestamp: the square for the 4th covers
 * 20:30 on the 4th through 08:30 on the 5th, which is why a 02:00 sign-in shows
 * up on the 4th and not the 5th. `buildMonthGrid` owns the layout and is unit
 * tested, so this component only paints.
 */

interface Props {
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

export default function AttendanceCalendar({ month, entries, scope, onPickNight, now }: Props) {
	const weeks = useMemo(() => buildMonthGrid(month), [month]);
	const byNight = useMemo(() => indexByNight(entries), [entries]);
	const tonight = now ? nightDateFor(now) : null;

	return (
		<div>
			<div className="grid grid-cols-7 gap-1.5 pb-2">
				{WEEKDAYS.map((day) => (
					<div
						key={day}
						className="text-center text-[10px] font-bold uppercase tracking-wider text-muted"
					>
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

					const base =
						"relative flex min-h-[72px] flex-col rounded-xl border p-1.5 text-left transition-colors";
					const tone = !day.inMonth
						? "border-transparent bg-transparent text-muted/40"
						: worked
							? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
							: "border-border bg-background text-muted";
					const ring = isTonight ? " ring-2 ring-indigo-500 ring-offset-1 ring-offset-surface" : "";
					const clickable = onPickNight ? " cursor-pointer hover:border-indigo-400" : "";

					const label = `${day.date}${
						worked
							? `, ${nights.length} sign-in${nights.length === 1 ? "" : "s"}`
							: ", no sign-in"
					}`;

					const content = (
						<>
							<span
								className={`text-xs font-semibold tabular-nums ${
									isTonight ? "text-indigo-600 dark:text-indigo-300" : ""
								}`}
							>
								{dayNumber}
							</span>

							{day.inMonth && worked && scope === "me" && (
								<span className="mt-auto text-[10px] leading-tight">
									<span className="block font-semibold text-emerald-700 dark:text-emerald-300">
										{formatLagosTime(new Date(nights[0].signedInAt))}
									</span>
									<span className="block text-muted">
										{nights[0].signedOutAt ? formatDuration(entryMinutes(nights[0])) : "open"}
									</span>
								</span>
							)}

							{day.inMonth && worked && scope === "all" && (
								<span className="mt-auto inline-flex w-fit items-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
									{nights.length}
								</span>
							)}
						</>
					);

					if (onPickNight && day.inMonth) {
						return (
							<button
								key={day.date}
								type="button"
								onClick={() => onPickNight(day.date)}
								aria-label={`${label}. Add or correct this night.`}
								className={`${base} ${tone}${ring}${clickable}`}
							>
								{content}
							</button>
						);
					}

					return (
						<div
							key={day.date}
							aria-label={day.inMonth ? label : undefined}
							className={`${base} ${tone}${ring}`}
						>
							{content}
						</div>
					);
				})}
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
				<span className="flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-sm border border-emerald-500/40 bg-emerald-500/20" />
					Signed in
				</span>
				<span className="flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-sm border border-border bg-background" />
					No sign-in
				</span>
				<span className="flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-sm ring-2 ring-indigo-500" />
					Tonight
				</span>
				<span className="ml-auto">A night runs 20:30 → 08:30 and is shown on the day it started.</span>
			</div>
		</div>
	);
}
