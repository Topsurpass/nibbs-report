import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RowStatus = "pass" | "warn" | "fail";

const STYLES: Record<RowStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
	pass: { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "OK", Icon: CheckCircle2 },
	warn: { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "Check", Icon: AlertTriangle },
	fail: { cls: "bg-destructive/15 text-destructive", label: "Rejected", Icon: XCircle },
};

export default function StatusBadge({ status, label }: { status: RowStatus; label?: string }) {
	const s = STYLES[status];
	return (
		<Badge className={cn("gap-1 font-bold", s.cls)}>
			<s.Icon className="size-3" aria-hidden />
			{label ?? s.label}
		</Badge>
	);
}
