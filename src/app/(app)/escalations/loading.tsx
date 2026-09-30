import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<Card className="px-5 py-4">
				<div className="flex items-center gap-3">
					<Skeleton className="size-8 rounded-full" />
					<Skeleton className="h-0.5 flex-1" />
					<Skeleton className="size-8 rounded-full" />
				</div>
			</Card>
			<Skeleton className="h-32 w-full rounded-2xl" />
		</div>
	);
}
