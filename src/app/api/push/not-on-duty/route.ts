import { requireUser } from "@/services/auth/guards";
import { addDismissal } from "@/services/push/repository";
import { notOnDutySchema } from "@/lib/validators/push";

export const runtime = "nodejs";

/**
 * "Not on duty today": stop sign-in reminders for that shift date, on every
 * device. Called from a notification's action button (by the service worker,
 * with the session cookie) and from the in-app pop-up.
 */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;
	const parsed = notOnDutySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ ok: false, error: "Which shift?" }, { status: 400 });
	try {
		await addDismissal(auth.user.id, parsed.data.shift, parsed.data.date);
		return Response.json({ ok: true });
	} catch (err) {
		console.error("[push] not-on-duty failed", err);
		return Response.json({ ok: false, error: "Couldn't save that. Try again." }, { status: 503 });
	}
}
