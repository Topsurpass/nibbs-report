"use client";

import { Columns3, FileSpreadsheet, Landmark, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import DropOverlay from "@/app/components/DropOverlay";
import { useFileDrop } from "@/hooks/useFileDrop";

const STEPS = [
	{ icon: FileSpreadsheet, title: "Drop the spool", body: "The fraudulent-transaction export from the database. Read in your browser." },
	{ icon: Columns3, title: "Confirm the columns", body: "Check the beneficiary bank-code column and pick what each bank should see." },
	{ icon: Landmark, title: "Download per bank", body: "One escalation workbook per beneficiary bank, or all of them as a .zip." },
];

interface SpoolDropHeroProps {
	reading: boolean;
	error: string | null;
	onFile: (file: File) => void;
}

/** First-run state for Fraud Escalation: one clear drop target. */
export default function SpoolDropHero({ reading, error, onFile }: SpoolDropHeroProps) {
	const { dragging, dragCount, open, dropProps, inputProps } = useFileDrop((files) => onFile(files[0]), {
		accept: ".xlsx,.xls,.csv",
		multiple: false,
	});

	return (
		<div className="space-y-6">
			<Card className="relative gap-0 overflow-hidden py-0" {...dropProps}>
				<input {...inputProps} />
				{dragging && <DropOverlay count={dragCount} label="to read" />}
				<div className="flex flex-col items-center gap-5 bg-gradient-to-b from-brand-teal/[0.06] to-transparent px-6 py-12 text-center sm:py-14">
					<div className="flex size-16 items-center justify-center rounded-2xl bg-brand-teal/15 text-brand-teal">
						{reading ? <Loader2 className="size-8 animate-spin" /> : <FileSpreadsheet className="size-8" />}
					</div>
					<div className="max-w-xl space-y-2">
						<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
							{reading ? "Reading the spool…" : "Drop the spooled transaction file"}
						</h2>
						<p className="text-sm text-muted-foreground">
							Every row is grouped by its beneficiary bank, ready to send for lien placement. Nothing is uploaded.
						</p>
					</div>
					<Button size="lg" onClick={open} disabled={reading} className="min-w-48">
						<Upload className="size-4" />
						Choose file
					</Button>
					<div className="flex flex-wrap justify-center gap-1.5">
						{[".xlsx", ".xls", ".csv"].map((ext) => (
							<span key={ext} className="tnum rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
								{ext}
							</span>
						))}
					</div>
					{error && (
						<p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
							{error}
						</p>
					)}
				</div>
			</Card>

			<ol className="grid gap-4 sm:grid-cols-3">
				{STEPS.map((s, i) => (
					<li key={s.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<s.icon className="size-4.5" />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-semibold text-foreground">
								<span className="tnum mr-1.5 text-muted-foreground">{i + 1}.</span>
								{s.title}
							</p>
							<p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}
