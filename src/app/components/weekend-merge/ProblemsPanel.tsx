import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CheckResult } from "@/lib/reconcile";

/**
 * Plain-language summary of the upload checks: what blocks the merge, what
 * needs a second look, or a single all-clear. Detailed reasons live on each
 * session card.
 */
export default function ProblemsPanel({ checks }: { checks: CheckResult[] }) {
	const fails = checks.filter((c) => c.status === "fail");
	const warns = checks.filter((c) => c.status === "warn");

	if (fails.length === 0 && warns.length === 0) {
		return (
			<Alert className="border-success/30 bg-success/5 text-success">
				<CheckCircle2 />
				<AlertTitle>All files are valid and complete</AlertTitle>
				<AlertDescription className="text-muted-foreground">
					Names, record format, row dates and net totals all check out. The merged file is ready.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="space-y-2">
			{fails.length > 0 && (
				<Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
					<XCircle />
					<AlertTitle>
						{fails.length} problem{fails.length === 1 ? "" : "s"} to fix before merging
					</AlertTitle>
					<AlertDescription>
						<ul className="mt-1 list-disc space-y-0.5 pl-4">
							{fails.map((c) => (
								<li key={c.id}>{c.detail}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
			{warns.length > 0 && (
				<Alert className="border-warning/30 bg-warning/5 text-warning">
					<AlertTriangle />
					<AlertTitle>Please double-check</AlertTitle>
					<AlertDescription className="text-foreground/80">
						<ul className="mt-1 list-disc space-y-0.5 pl-4">
							{warns.map((c) => (
								<li key={c.id}>{c.detail}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
