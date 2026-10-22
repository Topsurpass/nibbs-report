import { requireUser } from "@/services/auth/guards";
import { deleteSubscription, saveSubscription } from "@/services/push/repository";
import { subscriptionSchema, unsubscribeSchema } from "@/lib/validators/push";

export const runtime = "nodejs";

/** Turn notifications on for this device (the browser's PushSubscription). */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;
	const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ ok: false, error: "That isn't a valid push subscription." }, { status: 400 });
	}
	try {
		await saveSubscription(auth.user.id, parsed.data, request.headers.get("user-agent"));
		return Response.json({ ok: true });
	} catch (err) {
		console.error("[push] subscribe failed", err);
		return Response.json({ ok: false, error: "Couldn't turn on notifications. Try again." }, { status: 503 });
	}
}

/** Turn notifications off for this device. */
export async function DELETE(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;
	const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ ok: false, error: "Missing endpoint." }, { status: 400 });
	try {
		await deleteSubscription(auth.user.id, parsed.data.endpoint);
		return Response.json({ ok: true });
	} catch (err) {
		console.error("[push] unsubscribe failed", err);
		return Response.json({ ok: false, error: "Couldn't turn off notifications. Try again." }, { status: 503 });
	}
}
