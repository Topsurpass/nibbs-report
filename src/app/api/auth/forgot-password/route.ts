import { after } from "next/server";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { getUserByEmail } from "@/services/auth/users-repository";
import { createPasswordReset } from "@/services/auth/password-resets";
import { sendPasswordResetLinkEmail } from "@/services/email/mailer";

export const runtime = "nodejs";

/**
 * Start a self-service password reset. If the email belongs to an account, mint
 * a single-use token and email a reset link. Always responds `{ok:true}` — never
 * revealing whether the email exists (no user enumeration). Email is sent after
 * the response so SMTP never blocks the client.
 */
export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = forgotPasswordSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
	}

	const origin = new URL(request.url).origin;

	try {
		const user = await getUserByEmail(parsed.data.email);
		if (user) {
			const { token } = await createPasswordReset(user.id);
			const resetUrl = `${origin}/reset-password?token=${token}`;
			after(async () => {
				const sent = await sendPasswordResetLinkEmail(
					{ firstName: user.firstName, email: user.email },
					resetUrl,
				);
				if (!sent.ok && !sent.skipped) {
					console.warn("[auth] reset email failed", sent.error);
				}
			});
		}
	} catch (err) {
		// Don't leak failure state; log and still respond success.
		console.error("[auth] forgot-password error", err);
	}

	return Response.json({ ok: true });
}
