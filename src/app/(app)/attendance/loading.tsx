import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<Skeleton className="h-40 w-full rounded-2xl" />
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Card key={i} className="gap-2 p-4">
						<div className="flex items-center justify-between">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="size-8 rounded-lg" />
						</div>
						<Skeleton className="h-7 w-12" />
					</Card>
				))}
			</div>
			<Skeleton className="h-96 w-full rounded-2xl" />
		</div>
	);
}
