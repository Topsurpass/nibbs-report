"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, AlertTriangle, Timer } from "lucide-react";
import { useNow } from "@/hooks/useNow";
import {
	formatCountdown,
	formatDuration,
	formatLagosTime,
	formatNightLabel,
	type NightDate,
} from "@/lib/attendance/nightWindow";
import {
	SHIFT_META,
	activeDutyDate,
	dutyDateFor,
	nextShiftOpenAfter,
	shiftClosesAt,
	shiftHoursSummary,
	shiftSignOutDeadline,
	signOutDutyFor,
	type Shift,
} from "@/lib/attendance/shifts";
import { entryMinutes } from "@/lib/attendance/summary";
import type { AttendanceEntry } from "@/lib/attendance/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * The one thing an analyst comes to this page to do.
 *
 * The window is evaluated from the live clock on every tick, so the card opens
 * at 20:30 and closes at 08:30 without a reload. The server re-checks the same
 * rule using the same module — this is a convenience, never the enforcement.
 *
 * Sign-out reliability: this card's `held` state is seeded once from the
 * server at page load. A tab left open across the whole shift (very normal
 * for a night-duty page) never re-checks the server on its own, so if the
 * analyst signed in from a *different* tab or device, this tab would keep
 * showing "no entry" and never offer a sign-out button — that was the most
 * likely cause behind "some analysts find it hard to sign out". It now
 * re-syncs from the server on an interval and whenever the tab regains
 * focus, and if a shift was left open past its window it says so plainly
 * instead of quietly reverting to the generic closed-window message.
 */

interface Props {
	/** Which shift this card signs in and out of. */
	shift: Shift;
	/** The current shift's row as the server saw it at page render, if any. */
	initialNightDate: NightDate | null;
	initialEntry: AttendanceEntry | null;
	/** Lets the calendar re-read the month after a sign-in or sign-out. */
	onChanged: () => void;
}

interface Held {
	nightDate: NightDate;
	entry: AttendanceEntry | null;
}

const RESYNC_INTERVAL_MS = 2 * 60_000;
/** Below this much time left, the sign-out reminder switches to an urgent look. */
const URGENT_THRESHOLD_MS = 30 * 60_000;

export default function SignInCard({ shift, initialNightDate, initialEntry, onChanged }: Props) {
	const now = useNow();
	const meta = SHIFT_META[shift];
	const [held, setHeld] = useState<Held | null>(
		initialNightDate ? { nightDate: initialNightDate, entry: initialEntry } : null,
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);

	// The night this card is about: the one accepting sign-ins, or — during the
	// grace after 08:30 — the one still waiting to be signed out of.
	const activeNight = now ? activeDutyDate(shift, now) : initialNightDate;
	const canSignIn = now ? dutyDateFor(shift, now) !== null : false;

	// A held row only applies to the night it was loaded for. Crossing 20:30 with
	// the page open starts a new night, and last night's row must not leak in.
	const entry = held && held.nightDate === activeNight ? held.entry : null;

	// Held state for a *different* night that's still open — the analyst signed
	// in, the tab stayed open, and the window moved on without a sign-out. Worth
	// saying plainly rather than just going quiet (see file note above).
	const missedShift = held && held.nightDate !== activeNight && held.entry && !held.entry.signedOutAt ? held : null;

	// Pull the truth from the server: on an interval, and whenever the tab
	// becomes visible again (covers "signed in on my phone, came back to the
	// desktop tab that's been open since before my shift").
	const resync = useCallback(async () => {
		try {
			const res = await fetch(`/api/attendance/tonight?shift=${shift}`, { cache: "no-store" });
			if (!res.ok) return;
			const body = (await res.json()) as { ok: boolean; nightDate: NightDate | null; entry: AttendanceEntry | null };
			if (!body.ok) return;
			setHeld(body.nightDate ? { nightDate: body.nightDate, entry: body.entry } : null);
		} catch {
			// Best-effort — the next interval or tab focus tries again, and any
			// explicit sign-in/out action still adopts the row the server returns.
		}
	}, [shift]);

	useEffect(() => {
		const id = setInterval(resync, RESYNC_INTERVAL_MS);
		const onVisible = () => {
			if (document.visibilityState === "visible") resync();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, [resync]);

	const act = useCallback(
		async (action: "sign-in" | "sign-out") => {
			setBusy(true);
			setError(null);
			setFlash(null);
			try {
				const res = await fetch(`/api/attendance/${action}?shift=${shift}`, { method: "POST" });
				const body = (await res.json()) as {
					ok: boolean;
					error?: string;
					message?: string;
					locked?: boolean;
					entry?: AttendanceEntry;
				};

				// Adopt the row whenever the server sends one, refusal included. A tab
				// left open since before a sign-out would otherwise keep offering a
				// button for a night that is already closed.
				if (body.entry) setHeld({ nightDate: body.entry.nightDate, entry: body.entry });

				if (!body.ok) {
					setError(body.error ?? "That didn't work. Try again.");
					if (body.entry) onChanged();
					return;
				}
				setFlash(body.message ?? null);
				onChanged();
			} catch {
				setError("Couldn't reach the server. Check your connection and try again.");
			} finally {
				setBusy(false);
			}
		},
		[onChanged, shift],
	);

	const worked = useMemo(() => (entry ? entryMinutes(entry) : null), [entry]);

	// Before the first client tick the clock is unknown; showing a button that
	// might be wrong is worse than showing nothing for one frame.
	if (!now) {
		return (
			<Card className="p-6">
				<div className="h-24 animate-pulse rounded-xl bg-muted" />
			</Card>
		);
	}

	const signedOutAlready = Boolean(entry?.signedOutAt);
	const openShift = Boolean(entry) && !signedOutAlready;
	const canSignOut = openShift && signOutDutyFor(shift, now) === activeNight;

	const msToDeadline =
		openShift && activeNight ? shiftSignOutDeadline(shift, activeNight).getTime() - now.getTime() : null;
	const urgent = msToDeadline !== null && msToDeadline <= URGENT_THRESHOLD_MS && msToDeadline > 0;

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
				shiftSignOutDeadline(shift, activeNight!),
			)}`,
		};
	} else if (canSignIn && activeNight) {
		status = {
			tone: "open",
			heading: "Sign-in is open",
			detail: `${meta.label} of ${formatNightLabel(activeNight)} · closes ${formatLagosTime(shiftClosesAt(shift, activeNight))}`,
		};
	} else {
		const opensAt = nextShiftOpenAfter(shift, now);
		status = {
			tone: "shut",
			heading: "Sign-in is closed",
			detail: `Opens at ${formatLagosTime(opensAt)}, in ${formatCountdown(opensAt.getTime() - now.getTime())}`,
		};
	}

	const dot = status.tone === "open" ? "bg-success" : status.tone === "done" ? "bg-primary" : "bg-muted-foreground/40";

	return (
		<div className="space-y-3">
			{missedShift && (
				<Alert variant="destructive">
					<AlertTriangle />
					<AlertDescription>
						You didn&rsquo;t sign out of the {meta.noun} of <strong>{formatNightLabel(missedShift.nightDate)}</strong>{" "}
						before the window closed, so that shift is now locked. Ask an admin to close it; it won&rsquo;t block
						you from signing in {meta.current}.
					</AlertDescription>
				</Alert>
			)}

			<Card className="gap-0 overflow-hidden py-0">
				<div className="hero-gradient px-6 py-5 text-white">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{meta.label} duty</p>
							<p className="tnum mt-1 text-3xl font-bold leading-none">{formatLagosTime(now)}</p>
							<p className="mt-1 text-xs text-white/70">Africa/Lagos</p>
						</div>
						<div className="text-right">
							<p className="text-sm font-semibold">
								<span
									className={cn("mr-2 inline-block size-2 rounded-full align-middle", status.tone === "shut" ? "bg-white/50" : "bg-white")}
									aria-hidden
								/>
								{status.heading}
							</p>
							<p className="mt-0.5 text-xs text-white/75">{status.detail}</p>
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3 px-6 py-5">
					<span className={cn("size-2.5 shrink-0 rounded-full", dot)} aria-hidden />

					{canSignIn && !entry && (
						<Button type="button" size="lg" onClick={() => act("sign-in")} disabled={busy}>
							{busy ? "Signing in…" : `Sign in for ${meta.current}`}
						</Button>
					)}

					{canSignOut && (
						<Button type="button" size="lg" onClick={() => act("sign-out")} disabled={busy}>
							{busy ? "Signing out…" : "Sign out"}
						</Button>
					)}

					{canSignOut && urgent && msToDeadline !== null && (
						<span className="inline-flex animate-pulse items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive">
							<Timer className="size-3.5" />
							Sign out closes in {formatCountdown(msToDeadline)}
						</span>
					)}

					{!canSignIn && !canSignOut && !signedOutAlready && (
						<p className="text-sm text-muted-foreground">
							{meta.label} duty runs {shiftHoursSummary(shift)}. Nothing else on this page is affected.
						</p>
					)}

					{signedOutAlready && (
						<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<Lock className="size-3.5" />
							This {meta.noun} is recorded and locked. Ask an admin if the times need changing.
						</p>
					)}
				</div>

				{(error || flash) && (
					<div
						role="status"
						className={cn(
							"border-t border-border px-6 py-3 text-sm",
							error ? "text-destructive" : "text-success",
						)}
					>
						{error ?? flash}
					</div>
				)}
			</Card>
		</div>
	);
}
