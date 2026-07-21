import { scheduleReportSchema } from "@/lib/validators/schedule";
import { requireUser } from "@/services/auth/guards";
import { buildScheduleXlsxBuffer } from "@/lib/schedule/excel";
import { scheduleFileName } from "@/lib/schedule/exportSchedule";
import { normalizeReport, type ScheduleReport } from "@/lib/schedule/template";

export const runtime = "nodejs";

/**
 * Build the styled `.xlsx` for a (possibly unsaved) report and stream it back as
 * a download. The editor posts its current draft here so the exported file always
 * matches what's on screen.
 */
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
		const report = normalizeReport(parsed.data as ScheduleReport);
		const buffer = await buildScheduleXlsxBuffer(report);
		return new Response(new Uint8Array(buffer), {
			status: 200,
			headers: {
				"Content-Type":
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": `attachment; filename="${scheduleFileName(report)}"`,
			},
		});
	} catch (err) {
		console.error("[schedule] export failed", err);
		return Response.json({ ok: false, error: "Couldn't build the file." }, { status: 503 });
	}
}
