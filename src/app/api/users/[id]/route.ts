import { requireAdmin } from "@/services/auth/guards";
import {
	countAdmins,
	deleteUser,
	getUserById,
	resetUserPassword,
	setUserRole,
	toPublicUser,
} from "@/services/auth/users-repository";
import { generatePassword, hashPassword } from "@/services/auth/passwords";
import { sendPasswordResetEmail } from "@/services/email/mailer";
import { updateRoleSchema } from "@/lib/validators/user";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Change an account's role (admin only). Blocks demoting the last remaining
 * admin so the app can never be locked out of user management.
 */
export async function PATCH(request: Request, ctx: Ctx) {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = updateRoleSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json({ ok: false, error: "Invalid role." }, { status: 400 });
	}

	try {
		const target = await getUserById(id);
		if (!target) {
			return Response.json({ ok: false, error: "User not found." }, { status: 404 });
		}

		if (target.role === "admin" && parsed.data.role === "analyst") {
			const admins = await countAdmins();
			if (admins <= 1) {
				return Response.json(
					{ ok: false, error: "Can't remove the last admin." },
					{ status: 400 },
				);
			}
		}

		const updated = await setUserRole(id, parsed.data.role);
		if (!updated) {
			return Response.json({ ok: false, error: "User not found." }, { status: 404 });
		}
		return Response.json({ ok: true, user: toPublicUser(updated) });
	} catch (err) {
		console.error("[users] role update failed", err);
		return Response.json({ ok: false, error: "Couldn't update the role." }, { status: 503 });
	}
}

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
