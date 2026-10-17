import { activeDutyDate, parseShift } from "@/lib/attendance/shifts";
import { requireUser } from "@/services/auth/guards";
import { getEntry } from "@/services/attendance/repository";

export const runtime = "nodejs";

/**
 * The signed-in analyst's entry for the current shift (`?shift=`): the date
 * open for sign-in, or — during the post-close grace — the one still eligible
 * for sign-out. Same precedence `SignInCard` computes client-side (and the
 * page's own server render uses), so a resync can never disagree with what
 * the button logic already decided.
 *
 * Lets the sign-in card re-sync from the server on an interval and on tab
 * focus, instead of trusting only the value it was seeded with at page load.
 */
export async function GET(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const shift = parseShift(new URL(request.url).searchParams.get("shift"));
	const nightDate = activeDutyDate(shift, new Date());

	try {
		const entry = nightDate ? await getEntry(auth.user.id, nightDate, shift) : null;
		return Response.json({ ok: true, shift, nightDate, entry });
	} catch (err) {
		console.error("[attendance] current-shift lookup failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't check your current shift." },
			{ status: 503 },
		);
	}
}
