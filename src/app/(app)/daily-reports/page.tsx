import { redirect } from "next/navigation";
import ScheduleReportList from "@/app/components/schedule/ScheduleReportList";
import { listReports } from "@/services/schedule/repository";
import { getSessionUser } from "@/services/auth/sessions";

export const dynamic = "force-dynamic";

export default async function DailyReportsPage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	// Analysts see only their own reports; admins see all.
	const reports = await listReports({ userId: user.id, role: user.role });
	return <ScheduleReportList initialReports={reports} />;
}
