"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { useTour } from "@/hooks/useTour";
import TourModal from "@/app/components/onboarding/TourModal";
import AdminEntryDialog from "./AdminEntryDialog";
import AttendanceCalendar from "./AttendanceCalendar";
import MonthSummaryTable from "./MonthSummaryTable";
import NightList from "./NightList";
import SignInCard from "./SignInCard";
import { ATTENDANCE_TOUR, ATTENDANCE_TOUR_STEPS } from "./attendanceTour";
import { downloadSummaryJpeg } from "./paintSummary";
import { buildSummaryImage } from "@/lib/attendance/exportAttendance";
import {
	addMonths,
	currentMonth,
	formatMonth,
	nightDateFor,
	toLagos,
	type MonthKey,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { summarizeMonth } from "@/lib/attendance/summary";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";
import type { AuthUser } from "@/types/user";

/**
 * The night-duty register.
 *
 * Owns month + scope, and re-reads `/api/attendance` whenever either changes.
 * The window rules are not re-implemented here — `SignInCard` reads them from
 * `lib/attendance/nightWindow.ts`, the same module the routes enforce with.
 */

interface Props {
	user: AuthUser;
	initialMonth: MonthKey;
	initialPeople: AttendancePerson[];
	initialEntries: AttendanceEntry[];
	/** Tonight as the server saw it at render, so the card is right on first paint. */
	initialNightDate: NightDate | null;
	initialEntry: AttendanceEntry | null;
}

type Scope = "me" | "all";

export default function NightDutyRegister({
	user,
	initialMonth,
	initialPeople,
	initialEntries,
	initialNightDate,
	initialEntry,
}: Props) {
	const isAdmin = user.role === "admin";
	const now = useNow();
	const tour = useTour(ATTENDANCE_TOUR);

	const [month, setMonth] = useState<MonthKey>(initialMonth);
	const [scope, setScope] = useState<Scope>("me");
	const [imageError, setImageError] = useState<string | null>(null);

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

	const { people, entries, error } = loaded;
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

	const existingFor = useCallback(
		(userId: string, nightDate: NightDate) =>
			entries.find((e) => e.userId === userId && e.nightDate === nightDate) ?? null,
		[entries],
	);

	const exportHref = `/api/attendance/export?month=${month}&scope=${scope}`;

	const saveJpeg = useCallback(async () => {
		setImageError(null);
		try {
			await downloadSummaryJpeg(
				buildSummaryImage({ month, people, entries, scope, generatedAt: new Date() }),
			);
		} catch (err) {
			setImageError(err instanceof Error ? err.message : "Couldn't build the image.");
		}
	}, [month, people, entries, scope]);

	const openDialog = (nightDate: NightDate, userId?: string) => {
		setDialogNight(nightDate);
		setDialogUser(userId);
	};

	const thisMonth = currentMonth(now ?? new Date(`${initialMonth}-01T21:00:00Z`));

	// "Add a night" opens on tonight when that is in view, otherwise on the first
	// of the month being browsed — never on a date the admin is not looking at.
	const defaultNewNight: NightDate = (() => {
		if (!now) return `${month}-01`;
		const candidate = nightDateFor(now) ?? toLagos(now).date;
		return candidate.startsWith(month) ? candidate : `${month}-01`;
	})();
	const control =
		"rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/5";

	return (
		<main className="">
			{/*<header className="hero-gradient rounded-2xl px-6 py-6 text-white">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold">Night Duty</h1>
						<p className="mt-1 text-sm text-white/80">
							Sign in for your shift and see every night you have worked.
						</p>
					</div>
					<button
						type="button"
						onClick={tour.replay}
						className="rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
					>
						🧭 Show me around
					</button>
				</div>
			</header>*/}
			<header className="hero-gradient text-white">
				<div className="px-6 py-9 sm:px-10">
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
								Night Duty
							</p>
							<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
								Night Duty Register
							</h1>
							<p className="mt-2 max-w-xl text-sm text-white/80">
								Sign in for your shift and see every night you
								have worked.
							</p>
						</div>

						{/* Replay: the tour auto-shows once, but it has to stay
						    reachable afterwards or it may as well not exist. */}
						<button
							type="button"
							onClick={tour.replay}
							className="no-print shrink-0 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
						>
							<span className="mr-1.5" aria-hidden>
								🧭
							</span>
							Show me around
						</button>
					</div>
				</div>
			</header>

			<SignInCard
				initialNightDate={initialNightDate}
				initialEntry={initialEntry}
				onChanged={refresh}
			/>

			<section className="rounded-2xl border border-border bg-surface m-6">
				<div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setMonth((m) => addMonths(m, -1))}
							aria-label="Previous month"
							className={control}
						>
							←
						</button>
						<button
							type="button"
							onClick={() => setMonth((m) => addMonths(m, 1))}
							aria-label="Next month"
							className={control}
						>
							→
						</button>
					</div>

					<div className="min-w-0">
						<h2 className="text-base font-bold text-foreground">
							{formatMonth(month)}
						</h2>
						<p className="text-[11px] text-muted">
							{loading
								? "Loading…"
								: `${entries.length} night${entries.length === 1 ? "" : "s"} recorded`}
						</p>
					</div>

					{month !== thisMonth && (
						<button
							type="button"
							onClick={() => setMonth(thisMonth)}
							className={control}
						>
							This month
						</button>
					)}

					{isAdmin && (
						<div
							role="group"
							aria-label="Whose register to show"
							className="ml-auto flex rounded-lg border border-border p-0.5"
						>
							{(["me", "all"] as const).map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setScope(value)}
									className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
										scope === value
											? "bg-indigo-600 text-white"
											: "text-muted hover:text-foreground"
									}`}
								>
									{value === "me" ? "Mine" : "Everyone"}
								</button>
							))}
						</div>
					)}

					<div className={`flex gap-2 ${isAdmin ? "" : "ml-auto"}`}>
						<a href={exportHref} className={control} download>
							⬇ Excel
						</a>
						<button
							type="button"
							onClick={saveJpeg}
							className={control}
						>
							🖼 Image
						</button>
						{isAdmin && scope === "all" && (
							<button
								type="button"
								onClick={() => openDialog(defaultNewNight)}
								className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
							>
								Add a night
							</button>
						)}
					</div>
				</div>

				{(error || imageError) && (
					<div
						role="alert"
						className="border-b border-border bg-red-500/10 px-5 py-3 text-sm text-red-700 dark:text-red-300"
					>
						{error ?? imageError}
					</div>
				)}

				<div className="px-5 py-5">
					<AttendanceCalendar
						month={month}
						entries={entries}
						scope={scope}
						now={now}
						onPickNight={
							isAdmin ? (night) => openDialog(night) : undefined
						}
					/>
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-surface m-6">
				<div className="border-b border-border px-5 py-4">
					<h2 className="text-base font-bold text-foreground">
						{scope === "all" ? "Nights per analyst" : "Your month"}
					</h2>
					<p className="text-[11px] text-muted">
						Hours count signed-out nights only — an open night is
						unknown, not zero.
					</p>
				</div>
				<div className="px-5 py-4">
					<MonthSummaryTable
						summaries={summaries}
						showEmail={scope === "all"}
					/>
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-surface m-6">
				<div className="border-b border-border px-5 py-4">
					<h2 className="text-base font-bold text-foreground">
						Every night
					</h2>
				</div>
				<div className="px-5 py-2">
					<NightList
						entries={entries}
						people={people}
						showAnalyst={scope === "all"}
						onEdit={
							isAdmin
								? (night, userId) => openDialog(night, userId)
								: undefined
						}
					/>
				</div>
			</section>

			{isAdmin && dialogNight && (
				<AdminEntryDialog
					open
					nightDate={dialogNight}
					initialUserId={dialogUser}
					people={people}
					existingFor={existingFor}
					onClose={() => setDialogNight(null)}
					onSaved={refresh}
				/>
			)}

			<TourModal
				open={tour.open}
				title="Night Duty"
				steps={ATTENDANCE_TOUR_STEPS}
				onDone={tour.complete}
			/>
		</main>
	);
}
