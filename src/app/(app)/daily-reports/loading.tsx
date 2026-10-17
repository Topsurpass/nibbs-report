import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Toolbar + month-grouped rows, matching the daily reports list. */
export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<Card className="gap-0 overflow-hidden py-0">
				<div className="flex items-center gap-3 border-b border-border p-4">
					<Skeleton className="h-8 w-72" />
					<Skeleton className="h-7 w-96" />
				</div>
				<Skeleton className="h-8 rounded-none" />
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3">
						<Skeleton className="h-9 w-12" />
						<Skeleton className="h-6 w-40 rounded-full" />
						<Skeleton className="h-6 flex-1" />
					</div>
				))}
			</Card>
		</div>
	);
}
