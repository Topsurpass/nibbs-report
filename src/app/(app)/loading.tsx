import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Shown instantly on navigation to "/" while the Settlement Audit workbench
 * mounts — mirrors its two-column layout so nothing jumps into place. */
export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<div className="lg:flex lg:items-start lg:gap-6">
				<div className="space-y-4 lg:w-80 lg:shrink-0">
					<Card className="gap-3 p-4">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-9 w-full" />
					</Card>
					<Skeleton className="h-28 w-full rounded-2xl" />
					<Skeleton className="h-28 w-full rounded-2xl" />
					<Skeleton className="h-10 w-full rounded-xl" />
				</div>
				<div className="mt-6 min-w-0 flex-1 lg:mt-0">
					<Skeleton className="min-h-[420px] w-full rounded-2xl" />
				</div>
			</div>
		</div>
	);
}
