import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatTileProps {
	icon: LucideIcon;
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	tone?: "default" | "warning" | "success" | "danger";
	className?: string;
}

const TONE_CLS: Record<NonNullable<StatTileProps["tone"]>, string> = {
	default: "bg-primary/10 text-primary",
	warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	danger: "bg-destructive/10 text-destructive",
};

/** Small KPI tile for bento-style stat rows at the top of a page. */
export default function StatTile({ icon: Icon, label, value, hint, tone = "default", className }: StatTileProps) {
	return (
		<Card className={cn("gap-2 p-4 transition-shadow hover:shadow-md", className)}>
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
				<div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_CLS[tone])}>
					<Icon className="size-4" />
				</div>
			</div>
			<p className="tnum text-2xl font-bold text-foreground">{value}</p>
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</Card>
	);
}
