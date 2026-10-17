import type { TourStep } from "@/app/components/onboarding/TourModal";
import type { TourMeta } from "@/lib/onboarding/tourState";

/**
 * Content for the Fraud Escalation walkthrough.
 *
 * Bump `version` whenever the feature changes enough that the explanation is
 * stale — everyone who already completed the tour will be shown the new one.
 */
export const ESCALATION_TOUR: TourMeta = { id: "escalation", version: 1 };

/** Small mock panel, so a step can show the UI it is describing. */
function Mock({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-xl border border-border bg-background p-3 text-xs">{children}</div>
	);
}

export const ESCALATION_TOUR_STEPS: TourStep[] = [
	{
		icon: "🚨",
		title: "Escalate to every bank at once",
		body: (
			<>
				<p>
					This replaces filtering the spool by bank one at a time. Drop the file once
					and get a separate workbook for every beneficiary bank, ready to attach to a
					lien request.
				</p>
				<p className="mt-2 text-muted-foreground">
					Takes about four clicks. Here&rsquo;s the whole flow.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="flex items-center justify-between gap-2 text-center font-medium text-foreground">
					<span className="flex-1 rounded-lg bg-card px-2 py-2">📄 One spool</span>
					<span className="text-muted-foreground" aria-hidden>
						→
					</span>
					<span className="flex-1 rounded-lg bg-card px-2 py-2">🏦 Split by bank</span>
					<span className="text-muted-foreground" aria-hidden>
						→
					</span>
					<span className="flex-1 rounded-lg bg-card px-2 py-2">📦 Send</span>
				</div>
			</Mock>
		),
	},
	{
		icon: "⬆",
		title: "Drop the spooled file",
		body: (
			<>
				<p>
					Drag the export straight in, or click to browse. <code>.xlsx</code>,{" "}
					<code>.xls</code> and <code>.csv</code> all work, and the right sheet is picked
					for you.
				</p>
				<p className="mt-2 text-muted-foreground">
					Nothing is uploaded while you review — the preview is built in your browser.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="rounded-lg border border-dashed border-border bg-card px-3 py-4 text-center">
					<p className="font-semibold text-foreground">✓ fraudulent.xlsx</p>
					<p className="mt-1 text-muted-foreground">184 rows · sheet &ldquo;Sheet1&rdquo;</p>
				</div>
			</Mock>
		),
	},
	{
		icon: "🎯",
		title: "Check the bank-code column",
		body: (
			<>
				<p>
					The app finds the column holding the beneficiary bank code, whether that&rsquo;s
					a plain code like <code>C39</code> or the first three characters of a 13-digit
					value like <code>0113064018987</code>.
				</p>
				<p className="mt-2">
					<strong>Always glance at this one.</strong> Some exports also carry the{" "}
					<em>sender&rsquo;s</em> bank code. Picking that would escalate to the wrong bank,
					so the app never selects a sender column for you — but the dropdown is there if
					you need to change it.
				</p>
			</>
		),
		visual: (
			<Mock>
				<p className="font-semibold text-foreground">Beneficiary bank-code column</p>
				<div className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-foreground">
					beneficiary_issuer_code — code, 100% matched ▾
				</div>
			</Mock>
		),
	},
	{
		icon: "☑",
		title: "Choose what the banks see",
		body: (
			<>
				<p>
					Every column comes through by default, plus a{" "}
					<strong>Beneficiary Bank</strong> column with the name spelled out. Untick
					anything you&rsquo;d rather not send.
				</p>
				<p className="mt-2 text-muted-foreground">
					Your choice is remembered, so the next spool with the same columns starts where
					you left off.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-foreground">
					<span>☑ Beneficiary Bank</span>
					<span>☑ beneficiary_name</span>
					<span>☑ amount</span>
					<span>☑ transaction_reference</span>
					<span className="text-muted-foreground">☐ mac</span>
					<span className="text-muted-foreground">☐ card_num</span>
				</div>
			</Mock>
		),
	},
	{
		icon: "⚠",
		title: "Name any unknown code once",
		body: (
			<>
				<p>
					If a code isn&rsquo;t in the bank directory, those rows still get their own file
					— nothing is dropped. Type the bank&rsquo;s name and it&rsquo;s saved for good.
				</p>
				<p className="mt-2 text-muted-foreground">
					Saved names apply to every future upload, for everyone on the team.
				</p>
			</>
		),
		visual: (
			<Mock>
				<p className="font-semibold text-warning">
					⚠ 1 unrecognised bank code — 1 transaction
				</p>
				<div className="mt-2 flex items-center gap-2">
					<span className="font-mono font-bold text-foreground">C62</span>
					<span className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-muted-foreground">
						NOMBA FS
					</span>
					<span className="rounded-lg bg-warning px-2 py-1.5 font-semibold text-warning-foreground">
						Save
					</span>
				</div>
			</Mock>
		),
	},
	{
		icon: "📦",
		title: "Download and send",
		body: (
			<>
				<p>
					Grab one bank&rsquo;s file from its row, or take{" "}
					<strong>Download all</strong> for a zip containing every bank plus a summary
					sheet. Each file ends with a totals row.
				</p>
				<p className="mt-2 text-muted-foreground">
					<strong>Combined workbook</strong> gives you the single file with one tab per
					bank, the same shape you used to build by hand.
				</p>
			</>
		),
		visual: (
			<Mock>
				<div className="space-y-1.5 text-foreground">
					<div className="flex items-center justify-between gap-2">
						<span>ROLEZ MICROFINANCE BANK</span>
						<span className="tabular-nums text-muted-foreground">134 · 266,690,000.00</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span>Providus Bank</span>
						<span className="tabular-nums text-muted-foreground">29 · 121,830,000.00</span>
					</div>
					<div className="flex items-center justify-between gap-2 border-t border-border pt-1.5 font-semibold">
						<span>TOTAL (9 banks)</span>
						<span className="tabular-nums">184 · 444,390,000.00</span>
					</div>
				</div>
			</Mock>
		),
	},
];
