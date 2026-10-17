import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarRange, Landmark, Receipt, ShieldAlert } from "lucide-react";

interface AuthShellProps {
	icon: LucideIcon;
	title: string;
	subtitle: string;
	children: ReactNode;
	footer?: ReactNode;
}

const FEATURES = [
	{ icon: Receipt, title: "Settlement Audit", body: "Every NIBBS_CHECKER check on the Frame and eTranzact files." },
	{ icon: CalendarRange, title: "Weekend Settlement", body: "Merge weekend and holiday sessions, verified row by row." },
	{ icon: ShieldAlert, title: "Fraud Escalation", body: "One workbook per beneficiary bank from a single spool." },
	{ icon: CalendarClock, title: "Duty Register", body: "Night and afternoon sign-ins with monthly exports." },
];

/**
 * Shared split-screen shell for every unauthenticated screen (login, forgot/
 * reset/change password): a brand panel on wide screens, the form on its own.
 */
export default function AuthShell({ icon: Icon, title, subtitle, children, footer }: AuthShellProps) {
	return (
		<main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
			<aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col xl:p-14">
				<div aria-hidden className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-sidebar-primary/30 blur-3xl" />
				<div aria-hidden className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full bg-brand-violet/25 blur-3xl" />

				<div className="relative flex items-center gap-3">
					<div className="hero-gradient flex size-10 items-center justify-center rounded-xl text-white shadow-lg shadow-sidebar-primary/30">
						<Landmark className="size-5" strokeWidth={2.25} />
					</div>
					<div className="leading-tight">
						<p className="text-base font-semibold text-white">Audit Toolkit</p>
						<p className="text-xs text-sidebar-foreground/60">NIBBS settlement · Frauddesk</p>
					</div>
				</div>

				<div className="relative mt-auto max-w-md space-y-8 pt-16">
					<div className="space-y-3">
						<h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
							Settlement checks and shift work, in one place.
						</h2>
						<p className="text-sm leading-relaxed text-sidebar-foreground/70">
							Files are processed in your browser. Nothing you audit leaves this machine.
						</p>
					</div>
					<ul className="space-y-4">
						{FEATURES.map((f) => (
							<li key={f.title} className="flex gap-3">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sidebar-ring ring-1 ring-white/10">
									<f.icon className="size-4" />
								</div>
								<div>
									<p className="text-sm font-medium text-white">{f.title}</p>
									<p className="text-xs text-sidebar-foreground/60">{f.body}</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				<p className="relative mt-12 text-xs text-sidebar-foreground/40">Internal tool · authorised staff only</p>
			</aside>

			<section className="flex items-center justify-center px-4 py-12 sm:px-8">
				<div className="w-full max-w-sm">
					<div className="mb-8">
						<div className="hero-gradient mb-6 flex size-11 items-center justify-center rounded-xl text-white shadow-lg shadow-primary/20">
							<Icon className="size-5" strokeWidth={2.25} />
						</div>
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
						<p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
					</div>

					{children}

					{footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
				</div>
			</section>
		</main>
	);
}
