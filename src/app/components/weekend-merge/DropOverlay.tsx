import { UploadCloud } from "lucide-react";

/** Full-bleed overlay shown while files are dragged over a drop target. */
export default function DropOverlay({ count, label }: { count: number; label: string }) {
	return (
		<div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[2px] animate-in fade-in duration-150">
			<UploadCloud className="size-8 text-primary" />
			<p className="text-sm font-semibold text-primary">
				{count > 1 ? `Drop ${count} files` : count === 1 ? "Drop 1 file" : "Drop files"} {label}
			</p>
		</div>
	);
}
