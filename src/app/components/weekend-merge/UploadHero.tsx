"use client";

import { ArrowDownUp, FileCheck2, FileStack, Files, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { useFileDrop } from "@/hooks/useFileDrop";
import { cn } from "@/lib/utils";
import DropOverlay from "./DropOverlay";
import NamingGuide from "./NamingGuide";

const HOW_IT_WORKS = [
	{
		icon: FileStack,
		title: "Upload every file at once",
		body: "Saturday, Sunday and any public holiday: 4 session files per day. Drop the whole batch together.",
	},
	{
		icon: ArrowDownUp,
		title: "We sort and merge",
		body: "Rows are combined Saturday 8am → Sunday 5pm, re-dated to the next business day.",
	},
	{
		icon: FileCheck2,
		title: "Verify against Settlement",
		body: "Drop Settlement's merged file and every row is compared, down to tabs and spaces.",
	},
];

/** First-run state: one big, unmistakable multi-file drop target. */
export default function UploadHero({ onFiles }: { onFiles: (files: File[]) => void }) {
	const { dragging, dragCount, open, dropProps, inputProps } = useFileDrop(onFiles, { accept: ".txt" });

	return (
		<div className="space-y-6">
			<Card className="relative gap-0 overflow-hidden py-0" {...dropProps}>
				<input {...inputProps} />
				{dragging && <DropOverlay count={dragCount} label="to start" />}
				<div
					className={cn(
						"flex flex-col items-center gap-6 bg-gradient-to-b from-primary/[0.05] to-transparent px-6 py-12 text-center sm:py-16",
					)}
				>
					<div className="relative size-20">
						<div className="absolute inset-0 -rotate-12 rounded-2xl border border-border bg-card shadow-sm" />
						<div className="absolute inset-0 rotate-6 rounded-2xl border border-border bg-card shadow-sm" />
						<div className="hero-gradient absolute inset-0 flex items-center justify-center rounded-2xl text-white shadow-md">
							<Files className="size-9" strokeWidth={1.75} />
						</div>
					</div>
					<div className="max-w-xl space-y-2">
						<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
							Drop all your weekend &amp; holiday files here
						</h2>
						<p className="text-sm text-muted-foreground">
							Upload <span className="font-medium text-foreground">multiple files at once</span>: 8 for a normal weekend, 12 when
							Friday or Monday is a public holiday. Any order works; we sort them for you.
						</p>
					</div>
					<Button size="lg" onClick={open} className="min-w-52">
						<Upload className="size-4" />
						Choose files
					</Button>
					<p className="text-xs text-muted-foreground">
						In the file picker, hold <Kbd>⌘</Kbd> or <Kbd>Ctrl</Kbd> to select several files, or <Kbd>⌘</Kbd>
						<Kbd>A</Kbd> to select them all.
					</p>
				</div>
				<div className="border-t border-border bg-muted/30 px-6 py-5">
					<NamingGuide />
				</div>
			</Card>

			<ol className="grid gap-4 sm:grid-cols-3">
				{HOW_IT_WORKS.map((step, i) => (
					<li key={step.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<step.icon className="size-4.5" />
						</div>
						<div className="space-y-1">
							<p className="text-sm font-semibold text-foreground">
								<span className="tnum mr-1.5 text-muted-foreground">{i + 1}.</span>
								{step.title}
							</p>
							<p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}
