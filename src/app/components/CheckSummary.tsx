"use client";

import { CheckCircle2, XCircle, AlertTriangle, type LucideIcon } from "lucide-react";
import type { CheckResult, CheckStatus } from "@/lib/reconcile";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<
	CheckStatus,
	{ ring: string; badge: string; icon: LucideIcon; label: string }
> = {
	pass: {
		ring: "ring-emerald-500/25 bg-emerald-500/5",
		badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
		icon: CheckCircle2,
		label: "PASS",
	},
	fail: {
		ring: "ring-destructive/30 bg-destructive/5",
		badge: "bg-destructive/15 text-destructive",
		icon: XCircle,
		label: "FAIL",
	},
	warn: {
		ring: "ring-amber-500/25 bg-amber-500/5",
		badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		icon: AlertTriangle,
		label: "CHECK",
	},
};

export default function CheckSummary({ checks }: { checks: CheckResult[] }) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{checks.map((c) => {
				const s = STATUS_STYLES[c.status];
				const Icon = s.icon;
				return (
					<div
						key={c.id}
						className={cn("print-block rounded-xl border border-border p-4 ring-1 ring-inset", s.ring)}
					>
						<div className="flex items-center justify-between gap-2">
							<p className="text-sm font-semibold text-foreground">{c.label}</p>
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide",
									s.badge,
								)}
							>
								<Icon className="size-3" aria-hidden />
								{s.label}
							</span>
						</div>
						<p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
					</div>
				);
			})}
		</div>
	);
}
