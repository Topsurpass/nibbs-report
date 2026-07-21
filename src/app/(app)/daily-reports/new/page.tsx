import { redirect } from "next/navigation";
import ScheduleReportEditor from "@/app/components/schedule/ScheduleReportEditor";
import { getSessionUser } from "@/services/auth/sessions";
import { getLatestReport } from "@/services/schedule/repository";
import { listUsers } from "@/services/auth/users-repository";
import { blankReport, normalizeReport, type ScheduleReport } from "@/lib/schedule/template";

export const dynamic = "force-dynamic";

function todayISO(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
		d.getDate(),
	).padStart(2, "0")}`;
}

export default async function NewDailyReportPage({
	searchParams,
}: {
	searchParams: Promise<{ duplicate?: string }>;
}) {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	const { duplicate } = await searchParams;
	const officer = `${user.firstName} ${user.lastName}`.trim();

	const users = await listUsers();
	const directory = users.map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }));

	let initial: ScheduleReport;
	if (duplicate === "latest") {
		const latest = await getLatestReport();
		initial = latest
			? // Carry findings forward, but start a fresh day and clear the time.
				normalizeReport({ ...latest.data, cover: { ...latest.data.cover, date: todayISO(), timeOfHandover: "" } })
			: blankReport({ date: todayISO(), outgoingOfficers: officer });
	} else {
		initial = blankReport({ date: todayISO(), outgoingOfficers: officer });
	}

	return (
		<ScheduleReportEditor
			mode="new"
			initial={initial}
			users={directory}
			currentUserName={officer}
		/>
	);
}
