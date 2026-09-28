"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
	title: string;
	subtitle: string;
	accept: string;
	file: File | null;
	summary?: string;
	error?: string;
	accent: "teal" | "indigo";
	onSelect: (file: File) => void;
}

const ACCENT: Record<string, { ring: string; icon: string; wash: string }> = {
	teal: {
		ring: "ring-brand-teal/25",
		icon: "bg-brand-teal/15 text-brand-teal",
		wash: "from-brand-teal/[0.06]",
	},
	indigo: {
		ring: "ring-primary/25",
		icon: "bg-primary/15 text-primary",
		wash: "from-primary/[0.06]",
	},
};

export default function FileDropzone({
	title,
	subtitle,
	accept,
	file,
	summary,
	error,
	accent,
	onSelect,
}: FileDropzoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const a = ACCENT[accent];

	const handleFiles = useCallback(
		(files: FileList | null) => {
			if (files && files.length > 0) onSelect(files[0]);
		},
		[onSelect],
	);

	return (
		<div
			role="button"
			tabIndex={0}
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
				"group relative cursor-pointer rounded-2xl border border-dashed bg-card bg-gradient-to-br p-6 ring-1 ring-inset transition-all",
				a.ring,
				a.wash,
				dragging ? "scale-[1.01] border-transparent shadow-lg" : "border-border hover:shadow-md",
			)}
		>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				className="hidden"
				onChange={(e) => handleFiles(e.target.files)}
			/>
			<div className="flex items-start gap-4">
				<div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm", a.icon)}>
					{file ? <CheckCircle2 className="size-6" /> : <UploadCloud className="size-6" />}
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-foreground">{title}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
					{file ? (
						<div className="mt-3">
							<p className="truncate text-sm font-medium text-foreground" title={file.name}>
								{file.name}
							</p>
							{summary && <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>}
						</div>
					) : (
						<p className="mt-3 text-xs font-medium text-foreground">
							Drag &amp; drop or <span className="underline underline-offset-2">browse</span>
						</p>
					)}
					{error && (
						<p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
							{error}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
