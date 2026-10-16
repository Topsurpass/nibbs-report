import { SESSION_LABELS } from "@/lib/session/nibbsSession";
import { cn } from "@/lib/utils";

const SEGMENTS = [
	{ text: "ETRANZACT_", caption: "Prefix" },
	{ text: "06062026", caption: "ddmmyyyy" },
	{ text: "_1", caption: "Session" },
	{ text: ".txt", caption: "" },
];

/** Explains the required file name, segment by segment, plus the session numbers. */
export default function NamingGuide({ className }: { className?: string }) {
	return (
		<div className={cn("flex flex-col gap-4 md:flex-row md:items-center md:justify-between", className)}>
			<div className="space-y-2">
				<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required file name</p>
				<div className="flex flex-wrap items-start gap-1.5">
					{SEGMENTS.map((s, i) => (
						<div key={s.text} className="flex flex-col items-center">
							<span
								className={cn(
									"tnum rounded-md border border-border bg-card px-2 py-1 text-sm font-semibold text-foreground",
									(i === 1 || i === 2) && "border-primary/30 bg-primary/10 text-primary",
								)}
							>
								{s.text}
							</span>
							<span className="mt-1 text-[11px] text-muted-foreground">{s.caption}</span>
						</div>
					))}
				</div>
			</div>
			<div className="space-y-2">
				<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</p>
				<ul className="flex flex-wrap gap-1.5">
					{SESSION_LABELS.map((label, i) => (
						<li key={label} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
							<span className="tnum font-semibold text-primary">_{i + 1}</span>
							<span className="text-muted-foreground">{label}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
