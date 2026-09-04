"use client";

import { useCallback, useMemo, useState } from "react";
import { useNow } from "@/hooks/useNow";
import {
	formatCountdown,
	formatDuration,
	formatLagosTime,
	formatNightLabel,
	nextOpenAfter,
	nightDateFor,
	signOutDeadline,
	signOutNightFor,
	windowClosesAt,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import { entryMinutes } from "@/lib/attendance/summary";
import type { AttendanceEntry } from "@/lib/attendance/types";

/**
 * The one thing an analyst comes to this page to do.
 *
 * The window is evaluated from the live clock on every tick, so the card opens
 * at 20:30 and closes at 08:30 without a reload. The server re-checks the same
 * rule using the same module — this is a convenience, never the enforcement.
 */

interface Props {
	/** Tonight's row as the server saw it at page render, if any. */
	initialNightDate: NightDate | null;
	initialEntry: AttendanceEntry | null;
	/** Lets the calendar re-read the month after a sign-in or sign-out. */
	onChanged: () => void;
}

interface Held {
	nightDate: NightDate;
	entry: AttendanceEntry | null;
}

export default function SignInCard({ initialNightDate, initialEntry, onChanged }: Props) {
	const now = useNow();
	const [held, setHeld] = useState<Held | null>(
		initialNightDate ? { nightDate: initialNightDate, entry: initialEntry } : null,
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);

	// The night this card is about: the one accepting sign-ins, or — during the
	// grace after 08:30 — the one still waiting to be signed out of.
	const activeNight = now ? (nightDateFor(now) ?? signOutNightFor(now)) : initialNightDate;
	const canSignIn = now ? nightDateFor(now) !== null : false;

	// A held row only applies to the night it was loaded for. Crossing 20:30 with
	// the page open starts a new night, and last night's row must not leak in.
	const entry = held && held.nightDate === activeNight ? held.entry : null;

	const act = useCallback(
		async (action: "sign-in" | "sign-out") => {
			setBusy(true);
			setError(null);
			setFlash(null);
			try {
				const res = await fetch(`/api/attendance/${action}`, { method: "POST" });
				const body = (await res.json()) as {
					ok: boolean;
					error?: string;
					message?: string;
					entry?: AttendanceEntry;
				};
				if (!body.ok || !body.entry) {
					setError(body.error ?? "That didn't work. Try again.");
					return;
				}
				setHeld({ nightDate: body.entry.nightDate, entry: body.entry });
				setFlash(body.message ?? null);
				onChanged();
			} catch {
				setError("Couldn't reach the server. Check your connection and try again.");
			} finally {
				setBusy(false);
			}
		},
		[onChanged],
	);

	const worked = useMemo(() => (entry ? entryMinutes(entry) : null), [entry]);

	// Before the first client tick the clock is unknown; showing a button that
	// might be wrong is worse than showing nothing for one frame.
	if (!now) {
		return (
			<section className="rounded-2xl border border-border bg-surface p-6">
				<div className="h-24 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
			</section>
		);
	}

	const signedOutAlready = Boolean(entry?.signedOutAt);
	const openShift = Boolean(entry) && !signedOutAlready;
	const canSignOut = openShift && signOutNightFor(now) === activeNight;

	let status: { tone: "open" | "done" | "shut"; heading: string; detail: string };
	if (signedOutAlready && entry) {
		status = {
			tone: "done",
			heading: "Shift complete",
			detail: `${formatLagosTime(new Date(entry.signedInAt))} → ${formatLagosTime(
				new Date(entry.signedOutAt!),
			)} · ${formatDuration(worked)}`,
		};
	} else if (openShift && entry) {
		status = {
			tone: "open",
			heading: "On duty",
			detail: `Signed in at ${formatLagosTime(new Date(entry.signedInAt))} · sign out by ${formatLagosTime(
				signOutDeadline(activeNight!),
			)}`,
		};
	} else if (canSignIn && activeNight) {
		status = {
			tone: "open",
			heading: "Sign-in is open",
			detail: `Night of ${formatNightLabel(activeNight)} · closes ${formatLagosTime(
				windowClosesAt(activeNight),
			)}`,
		};
	} else {
		const opensAt = nextOpenAfter(now);
		status = {
			tone: "shut",
			heading: "Sign-in is closed",
			detail: `Opens at 20:30 — in ${formatCountdown(opensAt.getTime() - now.getTime())}`,
		};
	}

	const dot =
		status.tone === "open"
			? "bg-emerald-500"
			: status.tone === "done"
				? "bg-indigo-500"
				: "bg-slate-400";

	return (
		<section className="overflow-hidden rounded-2xl border border-border bg-surface space-y-6 m-6">
			<div className="hero-gradient px-6 py-5 text-white">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
							Night duty
						</p>
						<p className="mt-1 text-3xl font-bold tabular-nums leading-none">
							{formatLagosTime(now)}
						</p>
						<p className="mt-1 text-xs text-white/70">
							Africa/Lagos
						</p>
					</div>
					<div className="text-right">
						<p className="text-sm font-semibold">
							<span
								className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
									status.tone === "shut"
										? "bg-white/50"
										: "bg-white"
								}`}
								aria-hidden
							/>
							{status.heading}
						</p>
						<p className="mt-0.5 text-xs text-white/75">
							{status.detail}
						</p>
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3 px-6 py-5">
				<span
					className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
					aria-hidden
				/>

				{canSignIn && !entry && (
					<button
						type="button"
						onClick={() => act("sign-in")}
						disabled={busy}
						className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
					>
						{busy ? "Signing in…" : "Sign in for tonight"}
					</button>
				)}

				{canSignOut && (
					<button
						type="button"
						onClick={() => act("sign-out")}
						disabled={busy}
						className="rounded-lg border border-indigo-500 px-5 py-2.5 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/10 disabled:opacity-60 dark:text-indigo-300"
					>
						{busy ? "Signing out…" : "Sign out"}
					</button>
				)}

				{!canSignIn && !canSignOut && !signedOutAlready && (
					<p className="text-sm text-muted">
						The register opens at 20:30 and closes at 08:30. Nothing
						else on this page is affected.
					</p>
				)}

				{signedOutAlready && (
					<p className="text-sm text-muted">
						Tonight is recorded. Nothing left to do.
					</p>
				)}

				{openShift && !canSignOut && (
					<p className="text-sm text-amber-600 dark:text-amber-400">
						The sign-out window has passed. Ask an admin to close
						this night.
					</p>
				)}
			</div>

			{(error || flash) && (
				<div
					role="status"
					className={`border-t border-border px-6 py-3 text-sm ${
						error
							? "text-red-600 dark:text-red-400"
							: "text-emerald-600 dark:text-emerald-400"
					}`}
				>
					{error ?? flash}
				</div>
			)}
		</section>
	);
}
