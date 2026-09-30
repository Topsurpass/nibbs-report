import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
	icon?: LucideIcon;
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

/**
 * Standard page header: small brand icon chip, eyebrow, title, description,
 * and right-aligned actions. Replaces the full-bleed gradient banner every
 * page used to open with — that pattern read as a marketing splash repeated
 * on every screen rather than a working dashboard. Color now lives in the
 * icon chip and the primary action, not a wall of the page.
 */
export default function PageHeader({ icon: Icon, eyebrow, title, description, actions, className }: PageHeaderProps) {
	return (
		<div className={cn("flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5", className)}>
			<div className="flex items-start gap-3.5">
				{Icon && (
					<div className="hero-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
						<Icon className="size-5" strokeWidth={2.25} />
					</div>
				)}
				<div className="min-w-0">
					{eyebrow && (
						<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
					)}
					<h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
					{description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
				</div>
			</div>
			{actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);
}
