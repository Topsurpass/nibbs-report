import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Card-gallery skeleton for the daily reports list. */
export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 8 }).map((_, i) => (
					<Card key={i} className="gap-3 p-4">
						<div className="flex items-center gap-3">
							<Skeleton className="size-11 shrink-0 rounded-lg" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-3.5 w-24" />
								<Skeleton className="h-4 w-16" />
							</div>
						</div>
						<div className="space-y-1.5 border-t border-border pt-3">
							<Skeleton className="h-3 w-32" />
							<Skeleton className="h-3 w-28" />
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}
