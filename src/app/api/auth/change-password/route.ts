import { changePasswordSchema } from "@/lib/validators/auth";
import { requireUser } from "@/services/auth/guards";
import { getUserById, updatePassword } from "@/services/auth/users-repository";
import { hashPassword, verifyPassword } from "@/services/auth/passwords";

export const runtime = "nodejs";

/**
 * Change the signed-in user's password. Verifies the current password, stores a
 * new scrypt hash, and clears the force-change flag. Used both for the mandatory
 * first-login change and voluntary changes.
 */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = changePasswordSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, errors: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		const user = await getUserById(auth.user.id);
		if (!user) {
			return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
		}

		const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
		if (!ok) {
			return Response.json(
				{ ok: false, errors: { currentPassword: ["Current password is incorrect"] } },
				{ status: 400 },
			);
		}

		await updatePassword(user.id, await hashPassword(parsed.data.newPassword));
		return Response.json({ ok: true });
	} catch (err) {
		console.error("[auth] change-password failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't update your password right now. Try again." },
			{ status: 503 },
		);
	}
}
