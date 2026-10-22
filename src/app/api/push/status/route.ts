import { readPushConfig } from "@/lib/push/config";
import { requireUser } from "@/services/auth/guards";
import { hasDevice } from "@/services/push/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the browser needs to turn push on: whether the server is set up (and
 * if not, which settings are missing), the public key to subscribe with, and
 * whether this device (`?endpoint=`) is already registered for this user.
 *
 * The key is served here at request time instead of being baked into the page
 * at build time, so a missing or changed key never needs a cache-free rebuild.
 */
export async function GET(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;
	const { enabled, publicKey, missing } = readPushConfig(process.env);
	const endpoint = new URL(request.url).searchParams.get("endpoint");
	try {
		const registered = endpoint && enabled ? await hasDevice(auth.user.id, endpoint) : false;
		return Response.json({ ok: true, enabled, publicKey: enabled ? publicKey : null, missing, registered });
	} catch (err) {
		console.error("[push] status failed", err);
		return Response.json({ ok: false, enabled, missing, error: "Couldn't check notifications." }, { status: 503 });
	}
}
