import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors PageHeader's footprint so the swap from loading → loaded doesn't
 * jump the layout. */
export default function PageHeaderSkeleton() {
	return (
		<div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
			<div className="flex items-start gap-3.5">
				<Skeleton className="size-10 shrink-0 rounded-xl" />
				<div className="space-y-2">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-6 w-56" />
					<Skeleton className="h-3.5 w-80 max-w-[70vw]" />
				</div>
			</div>
			<Skeleton className="h-9 w-32" />
		</div>
	);
}
