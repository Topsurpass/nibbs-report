import { nibbsBreachAppendSchema } from "@/lib/validators/schedule";
import { requireUser } from "@/services/auth/guards";
import {
	createReport,
	getReportForDate,
	updateReport,
} from "@/services/schedule/repository";
import { blankReport, normalizeReport } from "@/lib/schedule/template";
import { applyNibbsBreachRows, buildNibbsBreachRows } from "@/lib/schedule/nibbsBreachRows";

export const runtime = "nodejs";

/**
 * Push breached banks from the Settlement Auditor onto the caller's daily report
 * for a date. Appends to that day's ongoing report if one exists, otherwise creates
 * a fresh one seeded with the breach rows. Idempotent: re-adding the same
 * bank/session is a no-op (added: 0).
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

	const parsed = nibbsBreachAppendSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, error: "Some fields are invalid.", issues: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { date, session, breaches } = parsed.data;
	const rows = buildNibbsBreachRows(breaches, session);

	try {
		const existing = await getReportForDate(date, auth.user.id);

		if (existing) {
			const { report, added } = applyNibbsBreachRows(normalizeReport(existing.data), rows);
			if (added > 0) await updateReport(existing.id, report);
			return Response.json({
				ok: true,
				reportId: existing.id,
				added,
				created: false,
			});
		}

		const officer = `${auth.user.firstName} ${auth.user.lastName}`.trim() || auth.user.email;
		const seeded = blankReport({ date, outgoingOfficers: officer });
		const { report, added } = applyNibbsBreachRows(seeded, rows);
		const createdReport = await createReport(report, auth.user.id);
		return Response.json(
			{ ok: true, reportId: createdReport.id, added, created: true },
			{ status: 201 },
		);
	} catch (err) {
		console.error("[schedule] nibbs-breach append failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't add to the daily report. Try again." },
			{ status: 503 },
		);
	}
}
