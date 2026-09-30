import { nightDateFor, signOutNightFor } from "@/lib/attendance/nightWindow";
import { requireUser } from "@/services/auth/guards";
import { getEntry } from "@/services/attendance/repository";

export const runtime = "nodejs";

/**
 * The signed-in analyst's entry for "tonight" — the night currently open for
 * sign-in, or, during the post-08:30 grace period, the night still eligible
 * for sign-out. Same precedence `SignInCard` computes client-side (and the
 * page's own server render uses), so a resync can never disagree with what
 * the button logic already decided.
 *
 * Lets the sign-in card re-sync from the server on an interval and on tab
 * focus, instead of trusting only the value it was seeded with at page load
 * — the gap that made sign-out hard to find for an analyst who signed in
 * from a different tab or device than the one they came back to.
 */
export async function GET() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const now = new Date();
	const nightDate = nightDateFor(now) ?? signOutNightFor(now);

	try {
		const entry = nightDate ? await getEntry(auth.user.id, nightDate) : null;
		return Response.json({ ok: true, nightDate, entry });
	} catch (err) {
		console.error("[attendance] tonight lookup failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't check tonight's entry." },
			{ status: 503 },
		);
	}
}
