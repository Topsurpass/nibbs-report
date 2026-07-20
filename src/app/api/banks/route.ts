import { bankListSchema } from "@/lib/validators/bank";
import { requireUser } from "@/services/auth/guards";
import { listBanks, syncBanks } from "@/services/banks/repository";

export const runtime = "nodejs";

/** List the master bank list. Any signed-in user may read it. */
export async function GET() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	try {
		const banks = await listBanks();
		return Response.json({ ok: true, banks });
	} catch (err) {
		console.error("[banks] list failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't load banks right now." },
			{ status: 503 },
		);
	}
}

/**
 * Replace the master list with the posted array (add/edit/delete in one shot).
 * Any signed-in user may edit banks and collateral.
 */
export async function PUT(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = bankListSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, error: "Some rows are invalid.", issues: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	try {
		const banks = await syncBanks(parsed.data);
		return Response.json({ ok: true, banks });
	} catch (err) {
		console.error("[banks] save failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't save banks right now. Try again." },
			{ status: 503 },
		);
	}
}
