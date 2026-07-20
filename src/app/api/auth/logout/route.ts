import { clearSession } from "@/services/auth/sessions";

export const runtime = "nodejs";

/** Sign out: revoke the session row and clear the cookie. */
export async function POST() {
	await clearSession();
	return Response.json({ ok: true });
}
