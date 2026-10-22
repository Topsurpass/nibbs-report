import { requireUser } from "@/services/auth/guards";
import { hasDevice } from "@/services/push/repository";
import { pushConfigured } from "@/services/push/sender";

export const runtime = "nodejs";

/**
 * Whether push works on the server, and whether this device (`?endpoint=`) is
 * registered for this user — so the bell can show the truth after a reinstall
 * or a sign-in as someone else on the same browser.
 */
export async function GET(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;
	const endpoint = new URL(request.url).searchParams.get("endpoint");
	const enabled = pushConfigured();
	try {
		const registered = endpoint ? await hasDevice(auth.user.id, endpoint) : false;
		return Response.json({ ok: true, enabled, registered });
	} catch (err) {
		console.error("[push] status failed", err);
		return Response.json({ ok: false, enabled, error: "Couldn't check notifications." }, { status: 503 });
	}
}
