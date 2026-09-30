import PageHeaderSkeleton from "@/app/components/layout/PageHeaderSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Shown instantly on navigation to "/" while the Settlement Audit flow
 * mounts — mirrors its single-column, stepper-led layout. */
export default function Loading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeaderSkeleton />
			<div className="mx-auto w-full max-w-3xl space-y-6">
				<Card className="px-5 py-4">
					<div className="flex items-center gap-3">
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-0.5 flex-1" />
						<Skeleton className="size-8 rounded-full" />
						<Skeleton className="h-0.5 flex-1" />
						<Skeleton className="size-8 rounded-full" />
					</div>
				</Card>
				<Card className="gap-4 p-5">
					<Skeleton className="h-5 w-48" />
					<Skeleton className="h-9 w-40" />
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Skeleton className="h-28 w-full rounded-2xl" />
						<Skeleton className="h-28 w-full rounded-2xl" />
					</div>
				</Card>
				<div className="flex justify-center">
					<Skeleton className="h-11 w-64 rounded-xl" />
				</div>
			</div>
		</div>
	);
}
