"use client";

import { useRef, useState } from "react";
import { Files, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiFileDropzoneProps {
	title: string;
	subtitle: string;
	accept: string;
	/** Files currently loaded, shown as a count. */
	count: number;
	onSelect: (files: File[]) => void;
}

/** Drop zone that takes many files at once. Same look as FileDropzone. */
export default function MultiFileDropzone({ title, subtitle, accept, count, onSelect }: MultiFileDropzoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);

	const handleFiles = (files: FileList | null) => {
		if (files && files.length > 0) onSelect(Array.from(files));
	};

	return (
		<div
			role="button"
			tabIndex={0}
			aria-label={`${title}: drag and drop or browse`}
			onDragOver={(e) => {
				e.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDragging(false);
				handleFiles(e.dataTransfer.files);
			}}
			onClick={() => inputRef.current?.click()}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
			}}
			className={cn(
				"group relative cursor-pointer rounded-2xl border border-dashed bg-card bg-gradient-to-br from-primary/[0.06] p-6 ring-1 ring-inset ring-primary/25 transition-all",
				dragging ? "scale-[1.01] border-transparent shadow-lg" : "border-border hover:shadow-md",
			)}
		>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple
				className="hidden"
				onChange={(e) => {
					handleFiles(e.target.files);
					// Allow picking the same file again after fixing it.
					e.target.value = "";
				}}
			/>
			<div className="flex items-start gap-4">
				<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm">
					{count > 0 ? <Files className="size-6" /> : <UploadCloud className="size-6" />}
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-foreground">{title}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
					<p className="mt-3 text-xs font-medium text-foreground">
						{count > 0 ? `${count} file(s) loaded. Drop more to add or replace. ` : ""}
						Drag &amp; drop or <span className="underline underline-offset-2">browse</span>
					</p>
				</div>
			</div>
		</div>
	);
}
