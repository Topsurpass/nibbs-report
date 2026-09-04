import {
	formatLagosTime,
	nextOpenAfter,
	nightDateFor,
	windowClosesAt,
} from "@/lib/attendance/nightWindow";
import { requireUser } from "@/services/auth/guards";
import { signIn } from "@/services/attendance/repository";

export const runtime = "nodejs";

/**
 * Sign in for tonight.
 *
 * The night is computed here from the server clock — never taken from the
 * request. A client that lies about the time, or one whose machine clock is
 * simply wrong, cannot book a night it did not work.
 */
export async function POST() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const now = new Date();
	const nightDate = nightDateFor(now);

	if (!nightDate) {
		const opensAt = nextOpenAfter(now);
		return Response.json(
			{
				ok: false,
				error: `Sign-in opens at ${formatLagosTime(opensAt)}.`,
				opensAt: opensAt.toISOString(),
			},
			{ status: 403 },
		);
	}

	try {
		const { created, entry } = await signIn(auth.user.id, nightDate, now);
		return Response.json({
			ok: true,
			created,
			entry,
			closesAt: windowClosesAt(nightDate).toISOString(),
			message: created
				? `Signed in for the night of ${nightDate}.`
				: "You already signed in for tonight.",
		});
	} catch (err) {
		console.error("[attendance] sign-in failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't record your sign-in. Try again." },
			{ status: 503 },
		);
	}
}
