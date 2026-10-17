import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors ScheduleReportEditor: sticky title/action bar, section nav, form. */
export default function ScheduleEditorSkeleton() {
	return (
		<div>
			<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-6">
				<Skeleton className="size-9 rounded-lg" />
				<div className="space-y-1.5">
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-3 w-64 max-w-full" />
				</div>
				<Skeleton className="ml-auto h-8 w-24" />
				<Skeleton className="h-8 w-20" />
				<Skeleton className="h-8 w-20" />
			</div>
			<div className="grid gap-6 p-4 md:p-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
				<div className="space-y-1.5">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-12 rounded-lg" />
					))}
				</div>
				<div className="space-y-4">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-80 w-full rounded-2xl" />
				</div>
			</div>
		</div>
	);
}
