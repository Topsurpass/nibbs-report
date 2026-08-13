import { requireUser } from "@/services/auth/guards";
import {
	InvalidNipOverrideError,
	listNipOverrides,
	upsertNipOverride,
} from "@/services/escalation/nip-overrides-repository";

export const runtime = "nodejs";

/**
 * Operator overrides for the NIP institution directory.
 *
 * GET returns just the deltas; the client merges them over the bundled snapshot
 * with `mergeDirectory`, so the 250 built-in codes never travel over the wire.
 */
export async function GET() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	try {
		const overrides = await listNipOverrides();
		return Response.json({ ok: true, overrides });
	} catch (err) {
		console.error("[escalations] nip override list failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't load saved bank codes right now." },
			{ status: 503 },
		);
	}
}

/** Name an unrecognised code so every future upload resolves it. */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const { code, name } = (payload ?? {}) as { code?: unknown; name?: unknown };

	try {
		const saved = await upsertNipOverride(
			{ code: String(code ?? ""), name: String(name ?? "") },
			auth.user.id,
		);
		return Response.json({ ok: true, override: saved });
	} catch (err) {
		if (err instanceof InvalidNipOverrideError) {
			return Response.json({ ok: false, error: err.message }, { status: 400 });
		}
		console.error("[escalations] nip override save failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't save that mapping right now. Try again." },
			{ status: 503 },
		);
	}
}
