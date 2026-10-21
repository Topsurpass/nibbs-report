import { ArrowDown, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIX_LIST_ID } from "./AuditFixList";

interface AuditVerdictProps {
	failed: number;
	warnings: number;
	breaches: number;
	/** Problems in Settlement's files (see AuditFixList). */
	toFix: number;
	session?: string;
	className?: string;
}

/** One sentence answer to "can this go to NIBBS?", above the detail. */
export default function AuditVerdict({ failed, warnings, breaches, toFix, session, className }: AuditVerdictProps) {
	const pass = failed === 0;
	const chips = [
		failed > 0 && `${failed} check${failed === 1 ? "" : "s"} failed`,
		breaches > 0 && `${breaches} breach${breaches === 1 ? "" : "es"}`,
		warnings > 0 && `${warnings} to double-check`,
	].filter(Boolean) as string[];

	return (
		<div
			className={cn(
				"print-block flex items-start gap-4 rounded-xl border p-5",
				pass ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
				className,
			)}
		>
			<div
				className={cn(
					"flex size-11 shrink-0 items-center justify-center rounded-full",
					pass ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
				)}
			>
				{pass ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
			</div>
			<div className="min-w-0 space-y-1">
				<p className="text-lg font-semibold tracking-tight text-foreground">
					{pass ? "All checks passed" : "This audit needs attention"}
				</p>
				<p className="text-sm text-muted-foreground">
					{pass
						? `${session ? `${session} session. ` : ""}Totals, format and reconciliation all agree. Safe to submit to NIBBS.`
						: "Review the failed checks and breaches below before submitting to NIBBS."}
				</p>
				{toFix > 0 && (
					<a
						href={`#${FIX_LIST_ID}`}
						className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
					>
						{toFix} thing{toFix === 1 ? "" : "s"} for Settlement to fix
						<ArrowDown className="size-3.5" />
					</a>
				)}
				{chips.length > 0 && (
					<div className="flex flex-wrap gap-1.5 pt-1">
						{chips.map((c) => (
							<span
								key={c}
								className={cn(
									"rounded-full px-2 py-0.5 text-[11px] font-semibold",
									c.includes("double-check") ? "bg-warning/15 text-warning" : "bg-destructive/10 text-destructive",
								)}
							>
								{c}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
