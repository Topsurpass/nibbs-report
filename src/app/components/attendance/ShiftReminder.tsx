"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AlarmClock, Loader2, LogIn, LogOut, Moon, Sun, Timer } from "lucide-react";
import { toast } from "sonner";
import { useNow } from "@/hooks/useNow";
import { IGNORE_DIALOG_ATTR, useOtherDialogOpen } from "@/hooks/useOtherDialogOpen";
import { formatCountdown, formatLagosTime, formatNightLabel } from "@/lib/attendance/nightWindow";
import {
	EMPTY_MEMORY,
	decideReminder,
	markNotOnDuty,
	parseMemory,
	pruneMemory,
	snooze,
	type CurrentShift,
	type Reminder,
	type ReminderMemory,
} from "@/lib/attendance/reminders";
import { SHIFTS, SHIFT_META, shiftHours, type Shift } from "@/lib/attendance/shifts";
import type { AttendanceEntry } from "@/lib/attendance/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { postShiftAction } from "./shiftActions";

/**
 * Reminds the signed-in analyst to sign in to, or out of, the running duty
 * shift, on whatever page they are on. Mounted once in the app shell.
 *
 * Which reminder (if any) is decided by `decideReminder`, a pure function over
 * the clock, the user's current entries and what they already dismissed. Not
 * shown on the Duty Register itself: its sign-in card already says all this.
 */

const RESYNC_MS = 2 * 60_000;
const ICON: Record<Shift, typeof Moon> = { night: Moon, afternoon: Sun };

const storageKey = (userId: string) => `nibbs:shift-reminders:${userId}`;

function readMemory(userId: string): ReminderMemory {
	try {
		return parseMemory(window.localStorage.getItem(storageKey(userId)));
	} catch {
		return EMPTY_MEMORY;
	}
}

function writeMemory(userId: string, memory: ReminderMemory) {
	try {
		window.localStorage.setItem(storageKey(userId), JSON.stringify(memory));
	} catch {
		// Private mode or blocked storage: the reminder still works, it just
		// forgets dismissals on reload.
	}
}

async function fetchCurrent(): Promise<Record<Shift, CurrentShift>> {
	const pairs = await Promise.all(
		SHIFTS.map(async (shift) => {
			const res = await fetch(`/api/attendance/tonight?shift=${shift}`, { cache: "no-store" });
			const body = (await res.json()) as { ok: boolean; entry: AttendanceEntry | null };
			if (!res.ok || !body.ok) throw new Error("lookup failed");
			return [shift, { entry: body.entry }] as const;
		}),
	);
	return Object.fromEntries(pairs) as Record<Shift, CurrentShift>;
}

export default function ShiftReminder({ userId }: { userId: string }) {
	const now = useNow();
	const pathname = usePathname();
	const [current, setCurrent] = useState<Record<Shift, CurrentShift> | null>(null);
	const [memory, setMemory] = useState<ReminderMemory>(() =>
		typeof window === "undefined" ? EMPTY_MEMORY : readMemory(userId),
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Wait for any other dialog (e.g. a first-visit tour) to close before showing.
	const otherDialogOpen = useOtherDialogOpen();

	const resync = useCallback(() => {
		fetchCurrent()
			.then(setCurrent)
			.catch(() => {
				// Best effort: try again on the next interval or tab focus.
			});
	}, []);

	useEffect(() => {
		resync();
		const id = setInterval(resync, RESYNC_MS);
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

	const remember = useCallback(
		(update: (m: ReminderMemory) => ReminderMemory) => {
			setMemory((m) => {
				const next = pruneMemory(update(m), new Date());
				writeMemory(userId, next);
				return next;
			});
			setError(null);
		},
		[userId],
	);

	const onRegister = pathname === "/attendance" || pathname.startsWith("/attendance/");
	const reminder: Reminder | null = useMemo(
		() => (now && current && !onRegister ? decideReminder({ now, current, memory }) : null),
		// `now` ticks every second; the decision only changes at minute boundaries
		// or when entries/memory change, but re-deciding is cheap and pure.
		[now, current, memory, onRegister],
	);

	const act = async (r: Reminder) => {
		setBusy(true);
		setError(null);
		const result = await postShiftAction(r.kind, r.shift);
		setBusy(false);
		if (!result.ok) {
			setError(result.message);
			resync();
			return;
		}
		toast.success(
			r.kind === "sign-in"
				? `Signed in for the ${SHIFT_META[r.shift].noun} of ${formatNightLabel(r.date)}.`
				: `Signed out of the ${SHIFT_META[r.shift].noun}. Thanks.`,
		);
		resync();
	};

	if (!reminder || !now || otherDialogOpen) return null;

	const meta = SHIFT_META[reminder.shift];
	const Icon = ICON[reminder.shift];
	const urgent = reminder.kind === "sign-out" && reminder.phase === "grace";
	const msLeft = reminder.kind === "sign-out" ? reminder.deadline.getTime() - now.getTime() : 0;

	const title =
		reminder.kind === "sign-in"
			? `${meta.label} duty is open`
			: urgent
				? `Sign out of ${meta.noun} duty now`
				: `${meta.label} duty ends at ${formatLagosTime(reminder.closesAt)}`;

	const description =
		reminder.kind === "sign-in"
			? `You haven't signed in for ${meta.current} (${shiftHours(reminder.shift, reminder.date)}). Are you on duty?`
			: urgent
				? `Your ${meta.noun} shift has ended and you haven't signed out. After ${formatLagosTime(reminder.deadline)} it locks and an admin has to fix it.`
				: `You signed in at ${formatLagosTime(reminder.signedInAt)}. Remember to sign out when you finish.`;

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				// Closing (X, Esc, clicking outside) = "remind me later", so it
				// never pops straight back up on the next clock tick.
				if (!open) remember((m) => snooze(m, reminder.key, new Date()));
			}}
		>
			<DialogContent className="no-print sm:max-w-md" {...{ [IGNORE_DIALOG_ATTR]: "" }}>
				<DialogHeader>
					<div
						className={cn(
							"mb-2 flex size-11 items-center justify-center rounded-xl",
							urgent ? "bg-destructive/15 text-destructive" : "hero-gradient text-white",
						)}
					>
						{urgent ? <AlarmClock className="size-5" /> : <Icon className="size-5" />}
					</div>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{urgent && (
					<p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive">
						<Timer className="size-3.5" />
						Sign-out closes in {formatCountdown(msLeft)}
					</p>
				)}
				{error && (
					<p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{error}
					</p>
				)}

				<DialogFooter className="gap-2 sm:justify-between">
					{reminder.kind === "sign-in" ? (
						<>
							<Button variant="ghost" onClick={() => remember((m) => markNotOnDuty(m, reminder.key))} disabled={busy}>
								Not on duty today
							</Button>
							<div className="flex flex-col-reverse gap-2 sm:flex-row">
								<Button variant="outline" onClick={() => remember((m) => snooze(m, reminder.key, new Date()))} disabled={busy}>
									Remind me in 30 min
								</Button>
								<Button onClick={() => void act(reminder)} disabled={busy}>
									{busy ? <Loader2 className="animate-spin" /> : <LogIn className="size-4" />}
									Sign in now
								</Button>
							</div>
						</>
					) : (
						<>
							<Button variant="outline" onClick={() => remember((m) => snooze(m, reminder.key, new Date()))} disabled={busy}>
								{urgent ? "Dismiss" : "Remind me later"}
							</Button>
							<Button
								onClick={() => void act(reminder)}
								disabled={busy}
								className={cn(urgent && "bg-destructive text-white hover:bg-destructive/90")}
							>
								{busy ? <Loader2 className="animate-spin" /> : <LogOut className="size-4" />}
								Sign out now
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
