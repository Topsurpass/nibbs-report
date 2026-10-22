import { SHIFT_META, parseShift, signOutDutyFor } from "@/lib/attendance/shifts";
import { after } from "next/server";
import { requireUser } from "@/services/auth/guards";
import { signOut } from "@/services/attendance/repository";
import { notifyTeam } from "@/services/push/broadcast";

export const runtime = "nodejs";

/**
 * Sign out of the shift that is still open (`?shift=night|afternoon`).
 *
 * Uses `signOutDutyFor`, not `dutyDateFor`: sign-in shuts when the shift ends
 * but a shift that runs over must still be closeable during the grace period.
 */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const shift = parseShift(new URL(request.url).searchParams.get("shift"));
	const meta = SHIFT_META[shift];
	const now = new Date();
	const dutyDate = signOutDutyFor(shift, now);

	if (!dutyDate) {
		return Response.json(
			{ ok: false, error: `There's no open ${meta.noun} shift to sign out of.` },
			{ status: 403 },
		);
	}

	try {
		const { updated, entry } = await signOut(auth.user.id, dutyDate, shift, now);

		if (!entry) {
			return Response.json(
				{ ok: false, error: `You didn't sign in for this ${meta.noun}, so there's nothing to close.` },
				{ status: 409 },
			);
		}
		// A closed shift is final for the person who worked it. The database guard
		// (`signed_out_at is null`) already refuses the write; this turns that into
		// an explicit refusal rather than a no-op reported as success, so a stale
		// tab or a replayed request cannot look like it changed something.
		if (!updated) {
			return Response.json(
				{
					ok: false,
					locked: true,
					entry,
					error: `You've already signed out of this ${meta.noun}, so it's locked. Ask an admin if the times need changing.`,
				},
				{ status: 409 },
			);
		}

		const user = auth.user;
		after(() =>
			notifyTeam({ actor: user, action: "sign-out", shift, date: dutyDate, at: now }).catch((err) =>
				console.error("[push] team sign-out alert failed", err),
			),
		);

		return Response.json({
			ok: true,
			updated,
			entry,
			message: shift === "night" ? "Signed out. Have a good rest." : "Signed out. Thanks for covering the afternoon.",
		});
	} catch (err) {
		console.error("[attendance] sign-out failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't record your sign-out. Try again." },
			{ status: 503 },
		);
	}
}
