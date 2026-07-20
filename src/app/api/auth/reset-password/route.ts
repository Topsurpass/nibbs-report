import { resetPasswordSchema } from "@/lib/validators/auth";
import { consumePasswordReset } from "@/services/auth/password-resets";
import { updatePassword } from "@/services/auth/users-repository";
import { deleteUserSessions } from "@/services/auth/sessions";
import { hashPassword } from "@/services/auth/passwords";

export const runtime = "nodejs";

/**
 * Complete a password reset with a token from the emailed link. Redeems the
 * token (single-use, unexpired), sets the new password (clearing any
 * force-change flag), and revokes existing sessions so old logins can't linger.
 */
export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = resetPasswordSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, errors: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		const userId = await consumePasswordReset(parsed.data.token);
		if (!userId) {
			return Response.json(
				{ ok: false, error: "This reset link is invalid or has expired. Request a new one." },
				{ status: 400 },
			);
		}

		await updatePassword(userId, await hashPassword(parsed.data.newPassword));
		await deleteUserSessions(userId);

		return Response.json({ ok: true });
	} catch (err) {
		console.error("[auth] reset-password failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't reset your password right now. Try again." },
			{ status: 503 },
		);
	}
}
