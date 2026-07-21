import { notFound } from "next/navigation";
import ScheduleReportEditor from "@/app/components/schedule/ScheduleReportEditor";
import { getReport } from "@/services/schedule/repository";
import { listUsers } from "@/services/auth/users-repository";
import { normalizeReport } from "@/lib/schedule/template";

export const dynamic = "force-dynamic";

export default async function EditDailyReportPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const report = await getReport(id);
	if (!report) notFound();

	const users = await listUsers();
	const directory = users.map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }));

	return (
		<ScheduleReportEditor
			mode="edit"
			reportId={report.id}
			initial={normalizeReport(report.data)}
			users={directory}
		/>
	);
}
