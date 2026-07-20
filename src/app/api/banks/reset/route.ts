import { requireUser } from "@/services/auth/guards";
import { resetBanks } from "@/services/banks/repository";

export const runtime = "nodejs";

/** Reset the master list back to the built-in defaults. */
export async function POST() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	try {
		const banks = await resetBanks();
		return Response.json({ ok: true, banks });
	} catch (err) {
		console.error("[banks] reset failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't reset banks right now. Try again." },
			{ status: 503 },
		);
	}
}
