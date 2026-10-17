"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFileDrop } from "@/hooks/useFileDrop";
import type { CheckResult } from "@/lib/reconcile";
import type { SessionBoard as Board } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import DropOverlay from "@/app/components/DropOverlay";
import ProblemsPanel from "./ProblemsPanel";
import SessionBoard from "./SessionBoard";
import UnplacedFiles from "./UnplacedFiles";

interface SessionFilesCardProps {
	board: Board;
	fileCount: number;
	checks: CheckResult[];
	orderOf: Map<string, number>;
	replaced: string[];
	onFiles: (files: File[]) => void;
	onRemove: (id: string) => void;
	skippingMissing: boolean;
	onSkipMissing?: () => void;
	onRequireAll?: () => void;
	className?: string;
}

/** Uploaded files laid out by day and session. The whole card accepts more files. */
export default function SessionFilesCard({
	board,
	fileCount,
	checks,
	orderOf,
	replaced,
	onFiles,
	onRemove,
	skippingMissing,
	onSkipMissing,
	onRequireAll,
	className,
}: SessionFilesCardProps) {
	const { dragging, dragCount, open, dropProps, inputProps } = useFileDrop(onFiles, { accept: ".txt" });
	const days = board.days.length;

	return (
		<Card className={cn("relative", className)} {...dropProps}>
			<input {...inputProps} />
			{dragging && <DropOverlay count={dragCount} label="to add" />}
			<CardHeader>
				<CardTitle>Session files</CardTitle>
				<CardDescription>
					{fileCount} file{fileCount === 1 ? "" : "s"} across {days} day{days === 1 ? "" : "s"}, shown in merge order. Drop
					more files anywhere on this card.
				</CardDescription>
				<CardAction>
					<Button variant="outline" onClick={open}>
						<Plus className="size-4" />
						Add files
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="space-y-5">
				<ProblemsPanel checks={checks} onSkipMissing={onSkipMissing} onRequireAll={onRequireAll} />
				{replaced.length > 0 && (
					<p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
						Replaced with your new upload: <span className="tnum text-foreground">{replaced.join(", ")}</span>
					</p>
				)}
				<UnplacedFiles files={board.unplaced} onRemove={onRemove} />
				<SessionBoard board={board} orderOf={orderOf} skippingMissing={skippingMissing} onRemove={onRemove} />
			</CardContent>
		</Card>
	);
}
