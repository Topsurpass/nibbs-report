import ScheduleReportList from "@/app/components/schedule/ScheduleReportList";
import { listReports } from "@/services/schedule/repository";

export const dynamic = "force-dynamic";

export default async function DailyReportsPage() {
	const reports = await listReports();
	return <ScheduleReportList initialReports={reports} />;
}
