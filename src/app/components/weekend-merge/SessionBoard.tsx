"use client";

import { Badge } from "@/components/ui/badge";
import { weekdayName, type SessionBoard as Board } from "@/lib/weekendMerge";
import { cn } from "@/lib/utils";
import SessionSlotCard from "./SessionSlotCard";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

interface SessionBoardProps {
	board: Board;
	orderOf: Map<string, number>;
	/** Missing slots are being merged around rather than blocking. */
	skippingMissing: boolean;
	onRemove: (id: string) => void;
}

/** Days down, sessions across: the merge order reads left-to-right, top-to-bottom. */
export default function SessionBoard({ board, orderOf, skippingMissing, onRemove }: SessionBoardProps) {
	return (
		<div className="@container space-y-5">
			{board.days.map((day) => (
				<section key={day.date.getTime()} aria-label={`${weekdayName(day.date)} ${DATE_FMT.format(day.date)}`}>
					<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<h3 className="text-sm font-semibold text-foreground">{weekdayName(day.date)}</h3>
							<span className="text-sm text-muted-foreground">{DATE_FMT.format(day.date)}</span>
							{day.weekend ? (
								<Badge variant="secondary">Weekend</Badge>
							) : (
								<Badge className="bg-warning/15 text-warning">Weekday · public holiday?</Badge>
							)}
						</div>
						<span
							className={cn(
								"tnum text-xs font-medium",
								day.filled === 4 ? "text-muted-foreground" : skippingMissing ? "text-warning" : "text-destructive",
							)}
						>
							{day.filled}/4 sessions
						</span>
					</div>
					<ol className="grid grid-cols-1 gap-2.5 @xs:grid-cols-2 @2xl:grid-cols-4">
						{day.slots.map((slot) => (
							<SessionSlotCard
								key={slot.session}
								slot={slot}
								order={slot.files.length === 1 ? orderOf.get(slot.files[0].id) : undefined}
								skipped={skippingMissing && slot.state === "missing"}
								onRemove={onRemove}
							/>
						))}
					</ol>
				</section>
			))}
		</div>
	);
}
