import {
	durationMinutes,
	instantForNight,
	isWithinNight,
	parseClock,
} from "@/lib/attendance/nightWindow";
import { adminEntrySchema, deleteEntrySchema } from "@/lib/validators/attendance";
import { requireAdmin } from "@/services/auth/guards";
import { getUserById } from "@/services/auth/users-repository";
import { deleteEntry, upsertAdminEntry } from "@/services/attendance/repository";

export const runtime = "nodejs";

function badRequest(error: string) {
	return Response.json({ ok: false, error }, { status: 400 });
}

/**
 * Add or correct one night on an analyst's behalf. Admins only.
 *
 * Every row written here is stamped `source = 'admin'` with who wrote it, so a
 * corrected register still distinguishes what an analyst recorded themselves
 * from what was filled in afterwards.
 */
export async function POST(request: Request) {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return badRequest("Invalid request.");
	}

	const parsed = adminEntrySchema.safeParse(payload);
	if (!parsed.success) {
		return badRequest(parsed.error.issues[0]?.message ?? "Some fields are invalid.");
	}
	const { userId, nightDate, signedIn, signedOut, note } = parsed.data;

	const target = await getUserById(userId);
	if (!target) return badRequest("That analyst no longer exists.");

	const signedInAt = instantForNight(nightDate, parseClock(signedIn)!);
	if (!isWithinNight(nightDate, signedInAt)) {
		return badRequest("That sign-in time falls outside the night shift (20:30–08:30).");
	}

	let signedOutAt: Date | null = null;
	if (signedOut) {
		signedOutAt = instantForNight(nightDate, parseClock(signedOut)!);
		if (!isWithinNight(nightDate, signedOutAt)) {
			return badRequest("That sign-out time falls outside the night shift (20:30–08:30).");
		}
		if (durationMinutes(signedInAt, signedOutAt) === null) {
			return badRequest("Sign-out has to come after sign-in.");
		}
	}

	try {
		const entry = await upsertAdminEntry({
			userId,
			nightDate,
			signedInAt,
			signedOutAt,
			note: note?.trim() ? note.trim() : null,
			recordedBy: auth.user.id,
		});
		return Response.json({ ok: true, entry });
	} catch (err) {
		console.error("[attendance] admin upsert failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't save that night. Try again." },
			{ status: 503 },
		);
	}
}

/** Remove a night from the register. Admins only. */
export async function DELETE(request: Request) {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	const url = new URL(request.url);
	const parsed = deleteEntrySchema.safeParse({
		userId: url.searchParams.get("userId") ?? "",
		nightDate: url.searchParams.get("nightDate") ?? "",
	});
	if (!parsed.success) {
		return badRequest(parsed.error.issues[0]?.message ?? "Some fields are invalid.");
	}

	try {
		const removed = await deleteEntry(parsed.data.userId, parsed.data.nightDate);
		return Response.json({ ok: true, removed });
	} catch (err) {
		console.error("[attendance] delete failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't remove that night. Try again." },
			{ status: 503 },
		);
	}
}
