"use client";

import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditProblem } from "@/lib/settlementAudit/review";
import { cn } from "@/lib/utils";

export const FIX_LIST_ID = "what-to-fix";

interface AuditFixListProps {
	problems: AuditProblem[];
	/** Collateral breaches exist: worth saying they are not Settlement's to fix. */
	hasBreaches: boolean;
	/** Build and save the review workbook. */
	onDownload: () => Promise<void>;
	className?: string;
}

/** "702 [SPACE] 2026/…" with each separator drawn as a small chip. */
function FileText({ text, tone }: { text: string; tone: "bad" | "good" }) {
	return (
		<span className={cn("tnum text-xs [overflow-wrap:anywhere]", tone === "bad" ? "text-destructive" : "text-success")}>
			{text.split(/(\[TAB\]|\[SPACE\])/).map((part, i) =>
				part === "[TAB]" || part === "[SPACE]" ? (
					<span
						key={i}
						className={cn(
							"mx-0.5 inline-block rounded px-1 text-[10px] font-semibold",
							part === "[SPACE]" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
						)}
					>
						{part === "[TAB]" ? "TAB" : "SPACE"}
					</span>
				) : (
					<span key={i}>{part.trim()}</span>
				),
			)}
		</span>
	);
}

/** What the Settlement team has to change, line by line, and the workbook to send them. */
export default function AuditFixList({ problems, hasBreaches, onDownload, className }: AuditFixListProps) {
	const [building, setBuilding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const clean = problems.length === 0;

	const save = async () => {
		setBuilding(true);
		setError(null);
		try {
			await onDownload();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't build the workbook.");
		} finally {
			setBuilding(false);
		}
	};

	return (
		<Card id={FIX_LIST_ID} className={cn("no-print scroll-mt-20", !clean && "border-primary/30", className)}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{clean ? <CheckCircle2 className="size-4 text-success" /> : <Wrench className="size-4 text-primary" />}
					{clean ? "Settlement's files are correct" : "What Settlement needs to fix"}
					{!clean && <Badge variant="destructive">{problems.length}</Badge>}
				</CardTitle>
				<CardDescription>
					{clean
						? hasBreaches
							? "Nothing to fix in their files. The collateral breaches below are for escalation, not for Settlement."
							: "Their eTranzact file matches the Frame report line for line."
						: "Each row says where the problem is, what their file has and what it should be. The Frame report is the reference."}
				</CardDescription>
				<CardAction>
					<Button variant={clean ? "outline" : "default"} onClick={() => void save()} disabled={building}>
						{building ? <Loader2 className="animate-spin" /> : <FileSpreadsheet className="size-4" />}
						{building ? "Building…" : clean ? "Download review" : "Download .xlsx"}
					</Button>
				</CardAction>
			</CardHeader>
			{(error || !clean) && (
				<CardContent className="space-y-3">
					{error && (
						<p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</p>
					)}
					{!clean && (
						<>
							<p className="text-xs text-muted-foreground">
								Send them the .xlsx: a &ldquo;What to fix&rdquo; list like this one, plus every bank side by side with the
								Frame report.
							</p>
							<div className="max-h-[28rem] overflow-auto rounded-lg border">
								<Table>
									<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
										<TableRow className="hover:bg-transparent">
											<TableHead className="w-24">Where</TableHead>
											<TableHead>Problem</TableHead>
											<TableHead>In their file</TableHead>
											<TableHead>Should be</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{problems.map((p, i) => (
											<TableRow key={`${p.kind}-${p.where}-${i}`} className="align-top">
												<TableCell className="tnum font-semibold whitespace-nowrap text-foreground">{p.where}</TableCell>
												<TableCell className="min-w-48 whitespace-normal">
													<p className="text-sm font-medium text-foreground">{p.problem}</p>
													{p.bank && <p className="text-xs text-muted-foreground">{p.bank}</p>}
												</TableCell>
												<TableCell className="min-w-44 whitespace-normal">
													<FileText text={p.yours} tone="bad" />
												</TableCell>
												<TableCell className="min-w-44 whitespace-normal">
													<FileText text={p.shouldBe} tone="good" />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</>
					)}
				</CardContent>
			)}
		</Card>
	);
}
