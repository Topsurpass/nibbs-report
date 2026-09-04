import { currentMonth } from "@/lib/attendance/nightWindow";
import { requireUser } from "@/services/auth/guards";
import { loadRegister, parseMonth, parseScope } from "@/services/attendance/service";

export const runtime = "nodejs";

/**
 * The register for one month. `scope=all` is honoured for admins only — an
 * analyst asking for it silently gets their own nights rather than an error,
 * because the UI never offers them the toggle in the first place.
 */
export async function GET(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const url = new URL(request.url);
	const month = parseMonth(url.searchParams.get("month"), currentMonth(new Date()));
	const scope = parseScope(url.searchParams.get("scope"), auth.user.role === "admin");

	try {
		const register = await loadRegister(auth.user, month, scope);
		return Response.json({ ok: true, ...register });
	} catch (err) {
		console.error("[attendance] list failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't load the register right now." },
			{ status: 503 },
		);
	}
}
