import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface AuthShellProps {
	icon: LucideIcon;
	title: string;
	subtitle: string;
	children: ReactNode;
	footer?: ReactNode;
}

/**
 * Shared centered-card shell for every unauthenticated screen (login, forgot/
 * reset/change password). Keeps the brand mark, gradient background and card
 * treatment in one place instead of repeating it per page.
 */
export default function AuthShell({ icon: Icon, title, subtitle, children, footer }: AuthShellProps) {
	return (
		<main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
			<div
				aria-hidden
				className="pointer-events-none absolute -top-40 -left-32 size-96 rounded-full bg-primary/20 blur-3xl"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute -right-32 -bottom-40 size-96 rounded-full bg-brand-violet/20 blur-3xl"
			/>

			<div className="relative w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="hero-gradient flex size-12 items-center justify-center rounded-xl text-white shadow-lg shadow-primary/20">
						<Icon className="size-6" strokeWidth={2.25} />
					</div>
					<h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">{title}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
				</div>

				<Card className="border-border/80 py-0 shadow-xl shadow-black/5">
					<CardContent className="px-6 py-6">{children}</CardContent>
				</Card>

				{footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
			</div>
		</main>
	);
}
