import { notFound } from "next/navigation";
import ScheduleReportEditor from "@/app/components/schedule/ScheduleReportEditor";
import { getReport } from "@/services/schedule/repository";

export const dynamic = "force-dynamic";

export default async function EditDailyReportPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const report = await getReport(id);
	if (!report) notFound();

	return <ScheduleReportEditor mode="edit" reportId={report.id} initial={report.data} />;
}
