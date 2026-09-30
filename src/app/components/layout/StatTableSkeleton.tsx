import PageHeaderSkeleton from "./PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** PageHeader + a bento stat row + a card table — the shape shared by
 * Settings and User Management. */
export default function StatTableSkeleton({ tiles = 4, rows = 5 }: { tiles?: number; rows?: number }) {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{Array.from({ length: tiles }).map((_, i) => (
					<Card key={i} className="gap-2 p-4">
						<div className="flex items-center justify-between">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="size-8 rounded-lg" />
						</div>
						<Skeleton className="h-7 w-12" />
					</Card>
				))}
			</div>
			<Card className="gap-0 overflow-hidden py-0">
				<div className="space-y-0 divide-y divide-border">
					{Array.from({ length: rows }).map((_, i) => (
						<div key={i} className="flex items-center gap-3 px-5 py-3.5">
							<Skeleton className="size-8 shrink-0 rounded-full" />
							<div className="flex-1 space-y-1.5">
								<Skeleton className="h-3.5 w-36" />
								<Skeleton className="h-3 w-48" />
							</div>
							<Skeleton className="h-5 w-16 rounded-full" />
							<Skeleton className="size-8 rounded-md" />
						</div>
					))}
				</div>
			</Card>
		</div>
	);
}
