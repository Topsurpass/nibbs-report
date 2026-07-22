import { scheduleReportSchema } from "@/lib/validators/schedule";
import { requireUser } from "@/services/auth/guards";
import {
	deleteReport,
	getReport,
	getReportOwner,
	updateReport,
} from "@/services/schedule/repository";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Fetch one report (full document) — the creator or an admin. */
export async function GET(_request: Request, ctx: Ctx) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;
	try {
		const report = await getReport(id);
		if (!report) return Response.json({ ok: false, error: "Report not found." }, { status: 404 });
		const owner = await getReportOwner(id);
		if (auth.user.role !== "admin" && owner !== auth.user.id) {
			return Response.json({ ok: false, error: "Report not found." }, { status: 404 });
		}
		return Response.json({ ok: true, report });
	} catch (err) {
		console.error("[schedule] get failed", err);
		return Response.json({ ok: false, error: "Couldn't load the report." }, { status: 503 });
	}
}

/** Update a report — the creator or an admin. */
export async function PUT(request: Request, ctx: Ctx) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;

	try {
		const owner = await getReportOwner(id);
		if (owner === null) {
			const exists = await getReport(id);
			if (!exists) return Response.json({ ok: false, error: "Report not found." }, { status: 404 });
		}
		if (auth.user.role !== "admin" && owner !== auth.user.id) {
			return Response.json(
				{ ok: false, error: "Only the creator or an admin can edit this report." },
				{ status: 403 },
			);
		}
	} catch (err) {
		console.error("[schedule] ownership check failed", err);
		return Response.json({ ok: false, error: "Couldn't save the report. Try again." }, { status: 503 });
	}

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
		const report = await updateReport(id, parsed.data);
		if (!report) return Response.json({ ok: false, error: "Report not found." }, { status: 404 });
		return Response.json({ ok: true, report });
	} catch (err) {
		console.error("[schedule] update failed", err);
		return Response.json({ ok: false, error: "Couldn't save the report. Try again." }, { status: 503 });
	}
}

/** Delete a report — the creator or an admin. */
export async function DELETE(_request: Request, ctx: Ctx) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;
	try {
		const owner = await getReportOwner(id);
		if (owner === null) {
			// Either the report is gone or it has no recorded creator; only admins
			// may remove ownerless reports.
			const exists = await getReport(id);
			if (!exists) return Response.json({ ok: false, error: "Report not found." }, { status: 404 });
		}
		if (auth.user.role !== "admin" && owner !== auth.user.id) {
			return Response.json(
				{ ok: false, error: "Only the creator or an admin can delete this report." },
				{ status: 403 },
			);
		}
		await deleteReport(id);
		return Response.json({ ok: true });
	} catch (err) {
		console.error("[schedule] delete failed", err);
		return Response.json({ ok: false, error: "Couldn't delete the report." }, { status: 503 });
	}
}
