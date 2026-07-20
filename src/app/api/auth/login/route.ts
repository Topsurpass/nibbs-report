import { loginSchema } from "@/lib/validators/auth";
import { getUserByEmail } from "@/services/auth/users-repository";
import { verifyPassword } from "@/services/auth/passwords";
import { createSession, setSessionCookie } from "@/services/auth/sessions";

// Neon HTTP driver + node:crypto want the Node runtime (not edge).
export const runtime = "nodejs";

/**
 * Sign in. Validates the credentials, verifies the scrypt hash, mints a
 * server-side session, and sets the httpOnly cookie. Failures return a single
 * generic message so the response never reveals which field was wrong.
 */
export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = loginSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json({ ok: false, error: "Enter your email and password." }, { status: 400 });
	}

	try {
		const user = await getUserByEmail(parsed.data.email);
		const ok = user && (await verifyPassword(parsed.data.password, user.passwordHash));
		if (!user || !ok) {
			return Response.json(
				{ ok: false, error: "Invalid email or password." },
				{ status: 401 },
			);
		}

		const { token, expiresAt } = await createSession(user.id);
		await setSessionCookie(token, expiresAt);

		return Response.json({ ok: true, mustChangePassword: user.mustChangePassword });
	} catch (err) {
		console.error("[auth] login failed", err);
		return Response.json(
			{ ok: false, error: "Sign-in is temporarily unavailable. Try again in a moment." },
			{ status: 503 },
		);
	}
}
