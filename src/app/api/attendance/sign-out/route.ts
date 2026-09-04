import { signOutNightFor } from "@/lib/attendance/nightWindow";
import { requireUser } from "@/services/auth/guards";
import { signOut } from "@/services/attendance/repository";

export const runtime = "nodejs";

/**
 * Sign out of the shift that is still open.
 *
 * Uses `signOutNightFor`, not `nightDateFor`: the sign-in window shuts at 08:30
 * but a shift that runs over must still be closeable during the grace period.
 */
export async function POST() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const now = new Date();
	const nightDate = signOutNightFor(now);

	if (!nightDate) {
		return Response.json(
			{ ok: false, error: "There's no open shift to sign out of." },
			{ status: 403 },
		);
	}

	try {
		const { updated, entry } = await signOut(auth.user.id, nightDate, now);

		if (!entry) {
			return Response.json(
				{ ok: false, error: "You didn't sign in for this night, so there's nothing to close." },
				{ status: 409 },
			);
		}
		return Response.json({
			ok: true,
			updated,
			entry,
			message: updated ? "Signed out. Have a good rest." : "You already signed out of this shift.",
		});
	} catch (err) {
		console.error("[attendance] sign-out failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't record your sign-out. Try again." },
			{ status: 503 },
		);
	}
}
