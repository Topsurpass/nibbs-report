import { notFound, redirect } from "next/navigation";
import ScheduleReportEditor from "@/app/components/schedule/ScheduleReportEditor";
import { getReport, getReportOwner } from "@/services/schedule/repository";
import { getSessionUser } from "@/services/auth/sessions";
import { listUsers } from "@/services/auth/users-repository";
import { normalizeReport } from "@/lib/schedule/template";

export const dynamic = "force-dynamic";

export default async function EditDailyReportPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	const { id } = await params;
	const report = await getReport(id);
	if (!report) notFound();

	// Analysts may only open their own reports; admins may open any.
	const owner = await getReportOwner(id);
	if (user.role !== "admin" && owner !== user.id) notFound();

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
