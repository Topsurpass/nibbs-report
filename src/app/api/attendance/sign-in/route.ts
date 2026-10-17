import { formatLagosTime, formatNightLabel } from "@/lib/attendance/nightWindow";
import {
	SHIFT_META,
	dutyDateFor,
	nextShiftOpenAfter,
	parseShift,
	shiftClosesAt,
} from "@/lib/attendance/shifts";
import { requireUser } from "@/services/auth/guards";
import { signIn } from "@/services/attendance/repository";

export const runtime = "nodejs";

/**
 * Sign in for the current shift (`?shift=night|afternoon`, default night).
 *
 * The shift date is computed here from the server clock — never taken from the
 * request. A client that lies about the time, or one whose machine clock is
 * simply wrong, cannot book a shift it did not work.
 */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const shift = parseShift(new URL(request.url).searchParams.get("shift"));
	const meta = SHIFT_META[shift];
	const now = new Date();
	const dutyDate = dutyDateFor(shift, now);

	if (!dutyDate) {
		const opensAt = nextShiftOpenAfter(shift, now);
		return Response.json(
			{
				ok: false,
				error: `${meta.label} sign-in opens at ${formatLagosTime(opensAt)}.`,
				opensAt: opensAt.toISOString(),
			},
			{ status: 403 },
		);
	}

	try {
		const { created, entry } = await signIn(auth.user.id, dutyDate, shift, now);
		return Response.json({
			ok: true,
			created,
			entry,
			closesAt: shiftClosesAt(shift, dutyDate).toISOString(),
			locked: Boolean(entry.signedOutAt),
			message: created
				? `Signed in for the ${meta.noun} of ${formatNightLabel(dutyDate)}.`
				: entry.signedOutAt
					// Nothing was written either way — the unique constraint saw to that —
					// but say plainly that the shift is closed rather than implying it is
					// still running.
					? `This ${meta.noun} is already signed out and locked. Ask an admin if it needs changing.`
					: `You already signed in for ${meta.current}.`,
		});
	} catch (err) {
		console.error("[attendance] sign-in failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't record your sign-in. Try again." },
			{ status: 503 },
		);
	}
}
