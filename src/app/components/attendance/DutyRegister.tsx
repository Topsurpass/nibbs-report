"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Compass,
	ChevronLeft,
	ChevronRight,
	Download,
	Image as ImageIcon,
	Plus,
	Moon,
	Sun,
	CalendarClock,
	CalendarDays,
	Clock,
	ListChecks,
	Users as UsersIcon,
} from "lucide-react";
import { useNow } from "@/hooks/useNow";
import { useTour } from "@/hooks/useTour";
import PageHeader from "@/app/components/layout/PageHeader";
import StatTile from "@/app/components/layout/StatTile";
import TourModal from "@/app/components/onboarding/TourModal";
import AdminEntryDialog from "./AdminEntryDialog";
import AttendanceCalendar from "./AttendanceCalendar";
import MonthSummaryTable from "./MonthSummaryTable";
import NightList from "./NightList";
import SignInCard from "./SignInCard";
import { ATTENDANCE_TOUR, ATTENDANCE_TOUR_STEPS } from "./attendanceTour";
import { downloadSummaryJpeg } from "./paintSummary";
import { requestNightRemoval } from "./removeNight";
import { buildSummaryImage } from "@/lib/attendance/exportAttendance";
import {
	addMonths,
	currentMonth,
	formatDuration,
	formatMonth,
	formatNightLabel,
	nightDateFor,
	toLagos,
	type MonthKey,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { SHIFT_META, SHIFTS, shiftHoursSummary, type Shift } from "@/lib/attendance/shifts";
import { personName, summarizeMonth, totalsOf } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";
import type { AuthUser } from "@/types/user";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import PushBanner from "../push/PushBanner";

/**
 * The duty register: night and afternoon shifts.
 *
 * Owns shift + month + scope. `/api/attendance` returns both shifts for a
 * month; the selected shift filters them here, so switching shift is instant.
 * The window rules are not re-implemented here — `SignInCard` reads them from
 * `lib/attendance/shifts.ts`, the same module the routes enforce with.
 */

/** A shift's current date and the viewer's row on it, as the server saw them. */
export interface CurrentShift {
	date: NightDate | null;
	entry: AttendanceEntry | null;
}

interface Props {
	user: AuthUser;
	/** Which shift to open on: the one running now (see `defaultShift`). */
	initialShift: Shift;
	initialMonth: MonthKey;
	initialPeople: AttendancePerson[];
	initialEntries: AttendanceEntry[];
	/** Each shift's current row, so the sign-in card is right on first paint. */
	initialCurrent: Record<Shift, CurrentShift>;
}

const SHIFT_ICON: Record<Shift, typeof Moon> = { night: Moon, afternoon: Sun };

type Scope = "me" | "all";

export default function DutyRegister({
	user,
	initialShift,
	initialMonth,
	initialPeople,
	initialEntries,
	initialCurrent,
}: Props) {
	const isAdmin = user.role === "admin";
	const now = useNow();
	const tour = useTour(ATTENDANCE_TOUR);

	const [shift, setShift] = useState<Shift>(initialShift);
	const meta = SHIFT_META[shift];
	const [month, setMonth] = useState<MonthKey>(initialMonth);
	const [scope, setScope] = useState<Scope>("me");
	const [imageError, setImageError] = useState<string | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [removingId, setRemovingId] = useState<string | null>(null);

	const [dialogNight, setDialogNight] = useState<NightDate | null>(null);
	const [dialogUser, setDialogUser] = useState<string | undefined>(undefined);

	// Bumped by anything that changes the register, to force a re-read.
	const [refreshKey, setRefreshKey] = useState(0);
	const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

	/**
	 * The register is stored together with the view it belongs to, and "loading"
	 * is derived from the two disagreeing. That keeps every `setState` inside an
	 * async callback rather than the effect body, and it makes stale data
	 * impossible to render: what is on screen is always labelled with the month
	 * and scope it was actually fetched for.
	 */
	const viewKey = `${month}|${scope}|${refreshKey}`;
	const [loaded, setLoaded] = useState({
		key: `${initialMonth}|me|0`,
		people: initialPeople,
		entries: initialEntries,
		error: null as string | null,
	});

	const { people, error } = loaded;
	// Both shifts arrive together; every view below is one shift's.
	const entries = useMemo(() => loaded.entries.filter((e) => e.shift === shift), [loaded.entries, shift]);
	const loading = loaded.key !== viewKey;

	useEffect(() => {
		// Already showing this exact view — the server rendered the first one.
		if (!loading) return;

		let cancelled = false;
		const controller = new AbortController();

		fetch(`/api/attendance?month=${month}&scope=${scope}`, { signal: controller.signal })
			.then((res) => res.json())
			.then(
				(body: {
					ok: boolean;
					error?: string;
					people?: AttendancePerson[];
					entries?: AttendanceEntry[];
				}) => {
					if (cancelled) return;
					if (!body.ok || !body.people || !body.entries) {
						setLoaded({
							key: viewKey,
							people: [],
							entries: [],
							error: body.error ?? "Couldn't load the register.",
						});
						return;
					}
					setLoaded({ key: viewKey, people: body.people, entries: body.entries, error: null });
				},
			)
			.catch((err: unknown) => {
				if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
				setLoaded({
					key: viewKey,
					people: [],
					entries: [],
					error: "Couldn't reach the server. Check your connection.",
				});
			});

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [loading, viewKey, month, scope]);

	const summaries = useMemo(() => summarizeMonth(people, entries), [people, entries]);
	const totals = useMemo(() => totalsOf(summaries), [summaries]);

	const existingFor = useCallback(
		(userId: string, nightDate: NightDate) =>
			entries.find((e) => e.userId === userId && e.nightDate === nightDate) ?? null,
		[entries],
	);

	const exportHref = `/api/attendance/export?month=${month}&scope=${scope}&shift=${shift}`;

	const saveJpeg = useCallback(async () => {
		setImageError(null);
		try {
			await downloadSummaryJpeg(
				buildSummaryImage({ month, people, entries, scope, shift, generatedAt: new Date() }),
			);
		} catch (err) {
			setImageError(err instanceof Error ? err.message : "Couldn't build the image.");
		}
	}, [month, people, entries, scope, shift]);

	/**
	 * Take a shift off the register.
	 *
	 * Admin-only and destructive, so it names the analyst and the night in the
	 * confirm — an admin scanning a grouped list is one row away from deleting
	 * the wrong person's shift.
	 */
	const removeNight = useCallback(
		async (entry: AttendanceEntry) => {
			const who = people.find((p) => p.id === entry.userId);
			const label = `${who ? personName(who) : "this analyst"}'s ${SHIFT_META[entry.shift].noun} of ${formatNightLabel(entry.nightDate)}`;
			if (!window.confirm(`Remove ${label}? This cannot be undone.`)) return;

			setRemoveError(null);
			setRemovingId(entry.id);
			try {
				const removed = await requestNightRemoval(entry.userId, entry.nightDate, entry.shift);
				if (!removed) setRemoveError(`That ${SHIFT_META[entry.shift].noun} was already off the register.`);
				refresh();
			} catch (err) {
				setRemoveError(err instanceof Error ? err.message : "Couldn't remove that entry.");
			} finally {
				setRemovingId(null);
			}
		},
		[people, refresh],
	);

	const openDialog = (nightDate: NightDate, userId?: string) => {
		setDialogNight(nightDate);
		setDialogUser(userId);
	};

	const thisMonth = currentMonth(now ?? new Date(`${initialMonth}-01T21:00:00Z`));

	// "Add" opens on the current shift date when that is in view, otherwise on the first
	// of the month being browsed — never on a date the admin is not looking at.
	const defaultNewNight: NightDate = (() => {
		if (!now) return `${month}-01`;
		const candidate = (shift === "night" ? nightDateFor(now) : null) ?? toLagos(now).date;
		return candidate.startsWith(month) ? candidate : `${month}-01`;
	})();

	return (
		<main className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={CalendarClock}
				eyebrow="Operations"
				title="Duty Register"
				description="Sign in for your night or afternoon shift, and see every shift the team has worked."
				actions={
					/* Replay: the tour auto-shows once, but it has to stay
					    reachable afterwards or it may as well not exist. */
					<Button type="button" variant="outline" onClick={tour.replay}>
						<Compass className="size-4" />
						Show me around
					</Button>
				}
			/>

			<PushBanner />

			<div role="tablist" aria-label="Shift" className="grid gap-3 sm:grid-cols-2">
				{SHIFTS.map((value) => {
					const Icon = SHIFT_ICON[value];
					const active = value === shift;
					return (
						<button
							key={value}
							type="button"
							role="tab"
							aria-selected={active}
							onClick={() => setShift(value)}
							className={cn(
								"group flex items-center gap-4 rounded-xl border bg-card p-4 text-left transition-all",
								active
									? "border-primary/50 shadow-sm ring-2 ring-primary/20"
									: "border-border hover:border-primary/30 hover:shadow-sm",
							)}
						>
							<div
								className={cn(
									"flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
									active ? "hero-gradient text-white" : "bg-muted text-muted-foreground group-hover:text-foreground",
								)}
							>
								<Icon className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold text-foreground">{SHIFT_META[value].label} duty</p>
								<p className="text-xs text-muted-foreground">{shiftHoursSummary(value)}</p>
							</div>
						</button>
					);
				})}
			</div>

			<SignInCard
				key={shift}
				shift={shift}
				initialNightDate={initialCurrent[shift].date}
				initialEntry={initialCurrent[shift].entry}
				onChanged={refresh}
			/>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatTile icon={CalendarDays} label={`${meta.plural} recorded`} value={loading ? "—" : totals.nights} />
				<StatTile icon={Clock} label="Total hours" value={loading ? "—" : formatDuration(totals.totalMinutes)} />
				<StatTile
					icon={ListChecks}
					label="Still open"
					value={loading ? "—" : totals.openNights}
					tone={totals.openNights > 0 ? "warning" : "default"}
				/>
				<StatTile icon={UsersIcon} label={scope === "all" ? "Analysts active" : "You"} value={loading ? "—" : totals.active} />
			</div>

			<Card className="gap-0 py-0">
				<div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => setMonth((m) => addMonths(m, -1))}
							aria-label="Previous month"
						>
							<ChevronLeft className="size-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => setMonth((m) => addMonths(m, 1))}
							aria-label="Next month"
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>

					<div className="min-w-0">
						<h2 className="text-base font-bold text-foreground">{formatMonth(month)}</h2>
						<p className="text-[11px] text-muted-foreground">
							{loading
								? "Loading…"
								: `${entries.length} ${entries.length === 1 ? meta.noun : meta.plural.toLowerCase()} recorded`}
						</p>
					</div>

					{month !== thisMonth && (
						<Button type="button" variant="outline" size="sm" onClick={() => setMonth(thisMonth)}>
							This month
						</Button>
					)}

					{isAdmin && (
						<div role="group" aria-label="Whose register to show" className="ml-auto flex rounded-lg border border-border p-0.5">
							{(["me", "all"] as const).map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setScope(value)}
									className={
										scope === value
											? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors"
											: "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
									}
								>
									{value === "me" ? "Mine" : "Everyone"}
								</button>
							))}
						</div>
					)}

					<div className={isAdmin ? "flex gap-2" : "ml-auto flex gap-2"}>
						<Button type="button" variant="outline" size="sm" render={<a href={exportHref} download />}>
							<Download className="size-3.5" />
							Excel
						</Button>
						<Button type="button" variant="outline" size="sm" onClick={saveJpeg}>
							<ImageIcon className="size-3.5" />
							Image
						</Button>
						{isAdmin && scope === "all" && (
							<Button type="button" size="sm" onClick={() => openDialog(defaultNewNight)}>
								<Plus className="size-3.5" />
								Add {shift === "afternoon" ? "an" : "a"} {meta.noun}
							</Button>
						)}
					</div>
				</div>

				{(error || imageError || removeError) && (
					<Alert variant="destructive" role="alert" className="rounded-none border-x-0 border-t-0">
						<AlertDescription>{error ?? imageError ?? removeError}</AlertDescription>
					</Alert>
				)}

				<Tabs defaultValue="calendar" className="gap-0">
					<TabsList className="mx-5 mt-4 w-fit">
						<TabsTrigger value="calendar">Calendar</TabsTrigger>
						<TabsTrigger value="summary">{scope === "all" ? "Per analyst" : "Your month"}</TabsTrigger>
						<TabsTrigger value="log">Every {meta.noun}</TabsTrigger>
					</TabsList>

					<TabsContent value="calendar" className="px-5 py-5">
						<AttendanceCalendar
							shift={shift}
							month={month}
							entries={entries}
							scope={scope}
							now={now}
							onPickNight={isAdmin ? (night) => openDialog(night) : undefined}
						/>
					</TabsContent>

					<TabsContent value="summary" className="px-5 py-5">
						<p className="mb-3 text-xs text-muted-foreground">
							Hours count signed-out {meta.plural.toLowerCase()} only; an open {meta.noun} is unknown, not zero.
							This table keeps everyone; the Excel and image downloads list only analysts with at least one{" "}
							{meta.noun}.
						</p>
						<MonthSummaryTable summaries={summaries} showEmail={scope === "all"} shift={shift} />
					</TabsContent>

					<TabsContent value="log" className="px-5 py-3">
						<NightList
							shift={shift}
							entries={entries}
							people={people}
							showAnalyst={scope === "all"}
							onEdit={isAdmin ? (night, userId) => openDialog(night, userId) : undefined}
							onRemove={isAdmin ? removeNight : undefined}
							removingId={removingId}
							resetKey={viewKey}
						/>
					</TabsContent>
				</Tabs>
			</Card>

			{isAdmin && dialogNight && (
				<AdminEntryDialog
					open
					shift={shift}
					nightDate={dialogNight}
					initialUserId={dialogUser}
					people={people}
					existingFor={existingFor}
					onClose={() => setDialogNight(null)}
					onSaved={refresh}
				/>
			)}

			<TourModal open={tour.open} title="Duty Register" steps={ATTENDANCE_TOUR_STEPS} onDone={tour.complete} />
		</main>
	);
}
