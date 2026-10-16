"use client";

import { CalendarRange, CheckCircle2, ListOrdered, Rows3, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CheckSummary from "@/app/components/CheckSummary";
import PageHeader from "@/app/components/layout/PageHeader";
import StatTile from "@/app/components/layout/StatTile";
import Stepper from "@/app/components/layout/Stepper";
import { useWeekendMerge } from "@/hooks/useWeekendMerge";
import { downloadText } from "@/lib/downloadText";
import { formatKobo, ZERO } from "@/lib/weekendMerge";
import MergeControls from "./MergeControls";
import MergedPreviewTable from "./MergedPreviewTable";
import MultiFileDropzone from "./MultiFileDropzone";
import SettlementCompare from "./SettlementCompare";
import SourceFileTable from "./SourceFileTable";

const STEPS = [
	{ label: "Upload", description: "Weekend & holiday files" },
	{ label: "Merge", description: "Ordered, re-dated" },
	{ label: "Compare", description: "Against Settlement" },
];

export default function WeekendSettlement() {
	const m = useWeekendMerge();
	const currentStep = !m.merge ? 0 : !m.comparison ? 1 : m.comparison.pass ? 3 : 2;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={CalendarRange}
				eyebrow="Report"
				title="Weekend Settlement"
				description="Drop every weekend and holiday ETRANZACT file. They are merged in date and session order into one file dated the next business day, then checked row by row against Settlement's merged file."
				actions={
					m.sources.length > 0 && (
						<Button variant="outline" onClick={m.reset}>
							<Trash2 className="size-4" />
							Start over
						</Button>
					)
				}
			/>

			<Card className="px-5 py-4">
				<Stepper steps={STEPS} current={currentStep} />
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>1. Upload the session files</CardTitle>
					<CardDescription>
						Every file named ETRANZACT_ddmmyyyy_n.txt (n = 1 to 4). Upload order does not matter.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<MultiFileDropzone
						title="Weekend / holiday eTranzact files"
						subtitle="Saturday, Sunday and any public holiday: all 4 sessions per day"
						accept=".txt"
						count={m.sources.length}
						onSelect={m.addSources}
					/>
					{m.replaced.length > 0 && (
						<p className="text-xs text-muted-foreground">Replaced with the new upload: {m.replaced.join(", ")}</p>
					)}
					{m.sources.length > 0 && (
						<>
							<CheckSummary checks={m.collectionChecks} />
							<SourceFileTable sources={m.ordered} onRemove={m.removeSource} />
						</>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>2. Merge</CardTitle>
					<CardDescription>
						Rows are appended Saturday 8am → 5pm, then Sunday 8am → 5pm, and so on. Every row takes the merge date.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{m.sources.length === 0 ? (
						<p className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
							Upload the session files above to continue.
						</p>
					) : !m.ready ? (
						<p className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
							Fix the failed upload checks above before merging.
						</p>
					) : (
						<>
							<MergeControls
								mergeDate={m.mergeDateStr}
								isDefaultDate={m.mergeDateOverride === null}
								onMergeDateChange={m.setMergeDateOverride}
								session={m.session}
								onSessionChange={m.setSession}
								fileName={m.merge?.fileName ?? null}
								downloadable={m.downloadable}
								onDownload={() => m.merge && downloadText(m.merge.fileName, m.merge.text)}
							/>
							{m.merge && (
								<>
									<section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
										<StatTile icon={ListOrdered} label="Files merged" value={m.merge.sources.length} />
										<StatTile icon={Rows3} label="Rows" value={m.merge.rows.length} />
										<StatTile
											icon={Scale}
											label="Net total"
											value={formatKobo(m.merge.sumKobo)}
											tone={m.merge.sumKobo === ZERO ? "success" : "danger"}
										/>
										<StatTile
											icon={CheckCircle2}
											label="Output checks"
											value={`${m.outputChecks.filter((c) => c.status === "pass").length}/${m.outputChecks.length}`}
											tone={m.downloadable ? "success" : "danger"}
										/>
									</section>
									<CheckSummary checks={m.outputChecks} />
									<MergedPreviewTable rows={m.merge.rows} />
								</>
							)}
						</>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>3. Compare with Settlement</CardTitle>
					<CardDescription>
						Drop the merged file Settlement sent. Every row is compared exactly: tabs, spaces, date, code, amount, order and line endings.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{m.merge ? (
						<SettlementCompare
							expectedName={m.merge.fileName}
							settlement={m.settlement}
							comparison={m.comparison}
							onSelect={m.setSettlementFile}
						/>
					) : (
						<p className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
							Available once the merge is ready.
						</p>
					)}
				</CardContent>
			</Card>

			<p className="text-center text-xs text-muted-foreground">
				All processing happens locally in your browser. Settlement data never leaves this machine.
			</p>
		</div>
	);
}
