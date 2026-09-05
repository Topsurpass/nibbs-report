import type { TourStep } from "@/app/components/onboarding/TourModal";
import type { TourMeta } from "@/lib/onboarding/tourState";

/**
 * Content for the Night Duty walkthrough.
 *
 * Bump `version` whenever the feature changes enough that the explanation is
 * stale — everyone who already completed the tour will be shown the new one.
 */
export const ATTENDANCE_TOUR: TourMeta = { id: "attendance", version: 1 };

/** Small mock panel, so a step can show the UI it is describing. */
function Mock({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-xl border border-border bg-background p-3 text-xs">{children}</div>
	);
}

export const ATTENDANCE_TOUR_STEPS: TourStep[] = [
	{
		icon: "🌙",
		title: "One tap to log your night",
		body: (
			<>
				<p>
					This is the night-duty register. Sign in when your shift starts, sign out when it
					ends, and every night you work is recorded against your name.
				</p>
				<p className="mt-2 text-muted">Five steps. About thirty seconds.</p>
			</>
		),
		visual: (
			<Mock>
				<div className="flex items-center justify-between gap-2 text-center font-medium text-foreground">
					<span className="flex-1 rounded-lg bg-surface px-2 py-2">🌙 Sign in</span>
					<span className="text-muted" aria-hidden>
						→
					</span>
					<span className="flex-1 rounded-lg bg-surface px-2 py-2">☀️ Sign out</span>
					<span className="text-muted" aria-hidden>
						→
					</span>
					<span className="flex-1 rounded-lg bg-surface px-2 py-2">📅 Your month</span>
				</div>
			</Mock>
		),
	},
	{
		icon: "🕗",
		title: "The button opens at 20:30",
		body: (
			<>
				<p>
					Sign-in is only available between <strong>20:30 and 08:30</strong>, so a night can
					only be marked while you are actually on duty. Outside those hours the card shows a
					countdown instead of a button.
				</p>
				<p className="mt-2 text-muted">
					All times are Africa/Lagos, taken from the server — not from your device clock.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-lg font-bold tabular-nums text-foreground">20:31</p>
						<p className="text-[10px] text-muted">Africa/Lagos</p>
					</div>
					<span className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">
						Sign in for tonight
					</span>
				</div>
			</Mock>
		),
	},
	{
		icon: "☀️",
		title: "Sign out when you hand over",
		body: (
			<>
				<p>
					Signing out records your hours for the night. There is a half-hour grace after
					08:30, so a shift that runs long can still be closed.
				</p>
				<p className="mt-2 text-muted">
					Once you sign out the night is <strong>locked</strong> — you cannot change it
					yourself. Ask an admin if a time is wrong.
				</p>
				<p className="mt-2 text-muted">
					Forget to sign out and the night still counts — it is listed as{" "}
					<strong>still open</strong> and contributes no hours, rather than being counted as
					zero.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="flex items-center gap-2">
					<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
						12h 00m
					</span>
					<span className="text-muted">20:30 → 08:30</span>
					<span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
						Still open
					</span>
				</div>
			</Mock>
		),
	},
	{
		icon: "📅",
		title: "Your calendar, month by month",
		body: (
			<>
				<p>
					Green squares are nights you signed in for. Use the arrows to look back at any
					previous month.
				</p>
				<p className="mt-2 text-muted">
					A night is shown on the day it <em>started</em>. Sign in at 02:00 on the 5th and it
					lands on the 4th, because that is the shift you were working.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="grid grid-cols-7 gap-1 text-center text-[10px]">
					{[3, 4, 5, 6, 7, 8, 9].map((day) => (
						<div
							key={day}
							className={`rounded-md border px-1 py-2 ${
								[4, 5, 8].includes(day)
									? "border-emerald-500/40 bg-emerald-500/10 font-semibold text-foreground"
									: "border-border bg-surface text-muted"
							}`}
						>
							{day}
						</div>
					))}
				</div>
			</Mock>
		),
	},
	{
		icon: "⬇",
		title: "Download the month",
		body: (
			<>
				<p>
					<strong>Excel</strong> gives you a workbook with a per-analyst summary and every
					night in detail. <strong>Image</strong> saves the summary as a JPEG you can paste
					straight into a chat.
				</p>
				<p className="mt-2 text-muted">
					Admins get an <strong>Everyone</strong> toggle covering the whole team, and can
					click any day to add or correct a night an analyst missed.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="flex items-center gap-2">
					<span className="rounded-lg border border-border bg-surface px-2 py-1.5">⬇ Excel</span>
					<span className="rounded-lg border border-border bg-surface px-2 py-1.5">🖼 Image</span>
					<span className="ml-auto flex rounded-lg border border-border p-0.5">
						<span className="rounded-md px-2 py-1 text-muted">Mine</span>
						<span className="rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white">
							Everyone
						</span>
					</span>
				</div>
			</Mock>
		),
	},
];
