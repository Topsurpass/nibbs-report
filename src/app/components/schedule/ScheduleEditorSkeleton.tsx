import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors ScheduleReportEditor's layout: back-link/title block, sticky
 * tab+action bar, then a form-shaped content skeleton. */
export default function ScheduleEditorSkeleton() {
	return (
		<div>
			<div className="space-y-2 p-4 pb-0 md:p-6 md:pb-0">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="h-7 w-72 max-w-full" />
				<Skeleton className="h-3.5 w-40" />
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-2 border-y border-border px-4 py-3 md:px-6">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="ml-auto h-8 w-24" />
				<Skeleton className="h-8 w-20" />
			</div>
			<div className="space-y-4 p-4 md:p-6">
				<Skeleton className="h-64 w-full max-w-2xl rounded-2xl" />
			</div>
		</div>
	);
}
