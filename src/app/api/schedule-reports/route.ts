import { scheduleReportSchema } from "@/lib/validators/schedule";
import { requireUser } from "@/services/auth/guards";
import { createReport, listReports } from "@/services/schedule/repository";

export const runtime = "nodejs";

/** List all daily schedule reports (newest first). Any signed-in user. */
export async function GET() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	try {
		const reports = await listReports();
		return Response.json({ ok: true, reports });
	} catch (err) {
		console.error("[schedule] list failed", err);
		return Response.json({ ok: false, error: "Couldn't load reports." }, { status: 503 });
	}
}

/** Create a report. Any signed-in user; the creator is recorded. */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = scheduleReportSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, error: "Some fields are invalid.", issues: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		const report = await createReport(parsed.data, auth.user.id);
		return Response.json({ ok: true, report }, { status: 201 });
	} catch (err) {
		console.error("[schedule] create failed", err);
		return Response.json({ ok: false, error: "Couldn't save the report. Try again." }, { status: 503 });
	}
}
