"use client";

import { CalendarRange, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/app/components/layout/PageHeader";
import { useWeekendMerge } from "@/hooks/useWeekendMerge";
import { downloadText } from "@/lib/downloadText";
import MergedPreviewTable from "./MergedPreviewTable";
import MergeSummaryPanel from "./MergeSummaryPanel";
import SessionFilesCard from "./SessionFilesCard";
import UploadHero from "./UploadHero";
import VerifyPanel from "./VerifyPanel";

export default function WeekendSettlement() {
	const m = useWeekendMerge();
	const hasFiles = m.sources.length > 0;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<PageHeader
				icon={CalendarRange}
				eyebrow="Report"
				title="Weekend Settlement"
				description="Combine every weekend and public-holiday settlement file into one file for the next business day, then verify it against Settlement's copy."
				actions={
					hasFiles && (
						<Button variant="outline" onClick={m.reset}>
							<RotateCcw className="size-4" />
							Start over
						</Button>
					)
				}
			/>

			{!hasFiles ? (
				<UploadHero onFiles={m.addSources} />
			) : (
				// One grid so small screens read files → merged file → verify, while
				// xl puts the merged-file panel in a sticky right column.
				<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
					<SessionFilesCard
						className="min-w-0 xl:col-start-1"
						board={m.board}
						fileCount={m.sources.length}
						checks={m.collectionChecks}
						orderOf={m.orderOf}
						replaced={m.replaced}
						onFiles={m.addSources}
						onRemove={m.removeSource}
					/>

					<MergeSummaryPanel
						className="xl:sticky xl:top-20 xl:col-start-2 xl:row-span-2 xl:row-start-1"
						merge={m.merge}
						checks={m.readinessChecks}
						mergeDate={m.mergeDateStr}
						isDefaultDate={m.mergeDateOverride === null}
						onMergeDateChange={m.setMergeDateOverride}
						session={m.session}
						onSessionChange={m.setSession}
						downloadable={m.downloadable}
						onDownload={() => m.merge && downloadText(m.merge.fileName, m.merge.text)}
					/>

					<div className="min-w-0 xl:col-start-1">
						{m.merge ? (
							<Card>
								<Tabs defaultValue="verify" className="gap-4">
									<CardHeader>
										<CardTitle>Check the result</CardTitle>
										<CardDescription>
											Compare with Settlement&rsquo;s merged file, or inspect every row we produced.
										</CardDescription>
										<TabsList className="mt-2">
											<TabsTrigger value="verify" className="px-3">
												Verify with Settlement
											</TabsTrigger>
											<TabsTrigger value="rows" className="px-3">
												Merged rows
												<span className="tnum text-muted-foreground">{m.merge.rows.length}</span>
											</TabsTrigger>
										</TabsList>
									</CardHeader>
									<CardContent>
										<TabsContent value="verify">
											<VerifyPanel
												expectedName={m.merge.fileName}
												settlement={m.settlement}
												comparison={m.comparison}
												onFile={m.setSettlementFile}
												onClear={m.clearSettlement}
											/>
										</TabsContent>
										<TabsContent value="rows">
											<MergedPreviewTable rows={m.merge.rows} />
										</TabsContent>
									</CardContent>
								</Tabs>
							</Card>
						) : (
							<Card className="border-dashed bg-muted/20 shadow-none">
								<CardContent className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
									<Lock className="size-4 shrink-0" />
									Verification with Settlement unlocks once every file passes its checks.
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
