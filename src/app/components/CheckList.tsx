import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { CheckResult, CheckStatus } from "@/lib/reconcile";
import { cn } from "@/lib/utils";

const ICON: Record<CheckStatus, { icon: typeof CheckCircle2; cls: string; rank: number }> = {
	fail: { icon: XCircle, cls: "text-destructive", rank: 0 },
	warn: { icon: AlertTriangle, cls: "text-warning", rank: 1 },
	pass: { icon: CheckCircle2, cls: "text-success", rank: 2 },
};

interface CheckListProps {
	checks: CheckResult[];
	/** Put failures first, then warnings, then passes. */
	problemsFirst?: boolean;
	className?: string;
}

/** Compact icon + label + detail list of checks, in a responsive grid. */
export default function CheckList({ checks, problemsFirst = false, className }: CheckListProps) {
	const ordered = problemsFirst
		? [...checks].sort((a, b) => ICON[a.status].rank - ICON[b.status].rank)
		: checks;
	return (
		<ul className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
			{ordered.map((c) => {
				const s = ICON[c.status];
				return (
					<li key={c.id} className="print-block flex items-start gap-2.5">
						<s.icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} aria-label={c.status} />
						<div className="min-w-0">
							<p className={cn("text-sm font-medium", c.status === "pass" ? "text-foreground" : s.cls)}>{c.label}</p>
							<p className="text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
