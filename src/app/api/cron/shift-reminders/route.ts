import { timingSafeEqual } from "node:crypto";
import { runDueReminders } from "@/services/push/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends the sign-in / sign-out reminders that are due. Called every 5 minutes
 * by an external scheduler (cron-job.org on Vercel Hobby, whose own crons run
 * only daily) with `Authorization: Bearer $CRON_SECRET`.
 *
 * Idempotent: calling it twice in a row sends nothing new. Outside production,
 * `?at=<ISO time>` runs it as if at that moment and `?users=id,id` limits it
 * to those users, so the eval never touches real people's reminders.
 */
function authorized(request: Request): boolean {
	const secret = process.env.CRON_SECRET?.trim();
	if (!secret) return false;
	const given = request.headers.get("authorization") ?? "";
	const want = `Bearer ${secret}`;
	return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

export async function GET(request: Request) {
	if (!authorized(request)) {
		return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
	}
	const params = new URL(request.url).searchParams;
	const testing = process.env.NODE_ENV !== "production";
	const at = testing ? params.get("at") : null;
	const users = testing ? params.get("users")?.split(",").filter(Boolean) : undefined;
	const now = at ? new Date(at) : new Date();
	if (Number.isNaN(now.getTime())) return Response.json({ ok: false, error: "Bad ?at." }, { status: 400 });
	try {
		const run = await runDueReminders(now, users);
		return Response.json({ ok: true, at: now.toISOString(), ...run });
	} catch (err) {
		console.error("[push] reminder run failed", err);
		return Response.json({ ok: false, error: "Reminder run failed." }, { status: 503 });
	}
}

/** cron-job.org can send either verb. */
export const POST = GET;
