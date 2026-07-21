import { createUserSchema } from "@/lib/validators/user";
import { requireAdmin } from "@/services/auth/guards";
import {
	createUser,
	getUserByEmail,
	listUsers,
	toPublicUser,
} from "@/services/auth/users-repository";
import { generatePassword, hashPassword } from "@/services/auth/passwords";
import { sendCredentialsEmail } from "@/services/email/mailer";
import { getAppBaseUrl } from "@/lib/appUrl";

export const runtime = "nodejs";

/** List all accounts (admin only). */
export async function GET() {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	try {
		const users = await listUsers();
		return Response.json({ ok: true, users });
	} catch (err) {
		console.error("[users] list failed", err);
		return Response.json({ ok: false, error: "Couldn't load users." }, { status: 503 });
	}
}

/**
 * Create an analyst (admin only). Generates a one-time password, stores its hash
 * with `must_change_password = true`, and emails the credentials. The plaintext
 * password leaves in the email; it is only echoed in the response when the email
 * could not be sent, so the admin can still deliver it manually.
 */
export async function POST(request: Request) {
	const auth = await requireAdmin();
	if ("response" in auth) return auth.response;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}

	const parsed = createUserSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, errors: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		const existing = await getUserByEmail(parsed.data.email);
		if (existing) {
			return Response.json(
				{ ok: false, error: "An account with that email already exists." },
				{ status: 409 },
			);
		}

		const password = generatePassword();
		const user = await createUser({
			firstName: parsed.data.firstName,
			lastName: parsed.data.lastName,
			email: parsed.data.email,
			passwordHash: await hashPassword(password),
			role: "analyst",
			mustChangePassword: true,
		});

		const loginUrl = `${getAppBaseUrl(request)}/login`;
		const sent = await sendCredentialsEmail(
			{ firstName: user.firstName, email: user.email },
			password,
			loginUrl,
		);

		return Response.json(
			{
				ok: true,
				user: toPublicUser(user),
				emailed: sent.ok,
				// Only surfaced when the email didn't go out, so the admin isn't stuck.
				tempPassword: sent.ok ? undefined : password,
			},
			{ status: 201 },
		);
	} catch (err) {
		console.error("[users] create failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't create the account right now. Try again." },
			{ status: 503 },
		);
	}
}
