import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RowStatus = "pass" | "warn" | "fail";

const STYLES: Record<RowStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
	pass: { cls: "bg-success/15 text-success", label: "OK", Icon: CheckCircle2 },
	warn: { cls: "bg-warning/15 text-warning", label: "Check", Icon: AlertTriangle },
	fail: { cls: "bg-destructive/15 text-destructive", label: "Rejected", Icon: XCircle },
};

export default function StatusBadge({ status, label }: { status: RowStatus; label?: string }) {
	const s = STYLES[status];
	return (
		<Badge className={cn("gap-1 font-semibold", s.cls)}>
			<s.Icon className="size-3" aria-hidden />
			{label ?? s.label}
		</Badge>
	);
}
