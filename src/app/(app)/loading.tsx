import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Mirrors Settlement Audit: the files card with two upload slots, then results. */
export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<Card className="gap-4 p-5">
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-2">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-3 w-72 max-w-full" />
					</div>
					<Skeleton className="h-8 w-48" />
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<Skeleton className="h-48 w-full rounded-xl" />
					<Skeleton className="h-48 w-full rounded-xl" />
				</div>
			</Card>
			<Skeleton className="h-28 w-full rounded-xl" />
		</div>
	);
}
