import { requireAdmin } from "@/services/auth/guards";
import {
	deleteUser,
	getUserById,
	resetUserPassword,
} from "@/services/auth/users-repository";
import { generatePassword, hashPassword } from "@/services/auth/passwords";
import { sendPasswordResetEmail } from "@/services/email/mailer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Delete an account (admin only). Admins cannot delete themselves. */
export async function DELETE(_request: Request, ctx: Ctx) {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;
	if (id === auth.user.id) {
		return Response.json(
			{ ok: false, error: "You cannot delete your own account." },
			{ status: 400 },
		);
	}

	try {
		const target = await getUserById(id);
		if (!target) {
			return Response.json({ ok: false, error: "User not found." }, { status: 404 });
		}
		await deleteUser(id);
		return Response.json({ ok: true });
	} catch (err) {
		console.error("[users] delete failed", err);
		return Response.json({ ok: false, error: "Couldn't delete the account." }, { status: 503 });
	}
}

/**
 * Reset an account's password (admin only): issues a fresh one-time password,
 * re-arms the force-change flag, and emails it. Echoes the password only when
 * the email failed.
 */
export async function POST(request: Request, ctx: Ctx) {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;

	try {
		const target = await getUserById(id);
		if (!target) {
			return Response.json({ ok: false, error: "User not found." }, { status: 404 });
		}

		const password = generatePassword();
		await resetUserPassword(id, await hashPassword(password));

		const loginUrl = `${new URL(request.url).origin}/login`;
		const sent = await sendPasswordResetEmail(
			{ firstName: target.firstName, email: target.email },
			password,
			loginUrl,
		);

		return Response.json({
			ok: true,
			emailed: sent.ok,
			tempPassword: sent.ok ? undefined : password,
		});
	} catch (err) {
		console.error("[users] reset failed", err);
		return Response.json({ ok: false, error: "Couldn't reset the password." }, { status: 503 });
	}
}
