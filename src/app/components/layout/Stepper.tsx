import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
	label: string;
	description?: string;
}

interface StepperProps {
	steps: Step[];
	/** 0-based index of the current step. Earlier steps read as complete. */
	current: number;
}

/** Horizontal progress stepper for multi-phase workflows (upload → configure
 * → review). Purely a progress indicator — it doesn't gate navigation, the
 * page's own state already does that. */
export default function Stepper({ steps, current }: StepperProps) {
	return (
		<ol className="flex items-start">
			{steps.map((step, i) => {
				const state = i < current ? "done" : i === current ? "active" : "upcoming";
				return (
					<li key={step.label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
						<div className="flex flex-col items-center gap-1.5 text-center">
							<div
								className={cn(
									"flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
									state === "done" && "bg-primary text-primary-foreground",
									state === "active" && "bg-primary/15 text-primary ring-2 ring-primary",
									state === "upcoming" && "bg-muted text-muted-foreground",
								)}
							>
								{state === "done" ? <Check className="size-4" /> : i + 1}
							</div>
							<div className="hidden sm:block">
								<p
									className={cn(
										"text-xs font-semibold",
										state === "upcoming" ? "text-muted-foreground" : "text-foreground",
									)}
								>
									{step.label}
								</p>
								{step.description && <p className="text-[11px] text-muted-foreground">{step.description}</p>}
							</div>
						</div>
						{i < steps.length - 1 && (
							<div className={cn("mx-2 h-0.5 flex-1 rounded-full transition-colors", state === "done" ? "bg-primary" : "bg-border")} />
						)}
					</li>
				);
			})}
		</ol>
	);
}
