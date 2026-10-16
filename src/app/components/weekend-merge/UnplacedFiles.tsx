"use client";

import { FileX2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SourceFile } from "@/lib/weekendMerge";

/** Files whose names can't be read, so they can't be placed on a day or session. */
export default function UnplacedFiles({ files, onRemove }: { files: SourceFile[]; onRemove: (id: string) => void }) {
	if (files.length === 0) return null;
	return (
		<section className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
			<h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
				<FileX2 className="size-4" />
				{files.length} file{files.length === 1 ? "" : "s"} with an unreadable name
			</h3>
			<p className="mt-0.5 text-xs text-muted-foreground">
				Rename to ETRANZACT_ddmmyyyy_n.txt and upload again, or remove.
			</p>
			<ul className="mt-2 divide-y divide-destructive/15">
				{files.map((f) => (
					<li key={f.id} className="flex items-center justify-between gap-3 py-1.5">
						<div className="min-w-0">
							<p className="tnum truncate text-xs font-medium text-foreground" title={f.name}>
								{f.name}
							</p>
							<p className="text-[11px] text-destructive">{f.issues.find((i) => i.severity === "fail")?.message}</p>
						</div>
						<Button variant="ghost" size="icon-xs" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)}>
							<X />
						</Button>
					</li>
				))}
			</ul>
		</section>
	);
}
