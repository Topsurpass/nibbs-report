import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import { toPublicUser, type PublicUser, type UserRole } from "./users-repository";

/**
 * Server-side sessions.
 *
 * A login mints a random 256-bit token; the browser holds it in an httpOnly
 * cookie while the database stores only its SHA-256. Validation re-hashes the
 * cookie and looks up an unexpired row — a DB leak can't be replayed, and a
 * session can be revoked by deleting its row.
 */

export const SESSION_COOKIE = "nibbs_session";
const SESSION_TTL_DAYS = 7;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function cookieSecure(): boolean {
	return process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase() === "true";
}

interface UserRow {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	role: UserRole;
	must_change_password: boolean;
	created_at: string;
}

/** Create a session row for a user and return the raw token + expiry. */
export async function createSession(
	userId: string,
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString("hex");
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	const sql = requireSql();
	await withRetry(
		() => sql`
			insert into nibbs_sessions (user_id, token_hash, expires_at)
			values (${userId}, ${hashToken(token)}, ${expiresAt.toISOString()})
		`,
	);
	return { token, expiresAt };
}

/** Write the session cookie (call from a route handler / server action). */
export async function setSessionCookie(
	token: string,
	expiresAt: Date,
): Promise<void> {
	const store = await cookies();
	store.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: cookieSecure(),
		path: "/",
		expires: expiresAt,
	});
}

/** Delete the current session (DB row + cookie). */
export async function clearSession(): Promise<void> {
	const store = await cookies();
	const token = store.get(SESSION_COOKIE)?.value;
	if (token) {
		try {
			const sql = requireSql();
			await withRetry(
				() => sql`delete from nibbs_sessions where token_hash = ${hashToken(token)}`,
			);
		} catch (err) {
			// Best-effort revoke; still clear the cookie below.
			console.warn("[auth] failed to delete session row", err);
		}
	}
	store.delete(SESSION_COOKIE);
}

/** Resolve the signed-in user from the session cookie, or null. */
export async function getSessionUser(): Promise<PublicUser | null> {
	const store = await cookies();
	const token = store.get(SESSION_COOKIE)?.value;
	if (!token) return null;

	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select u.id, u.first_name, u.last_name, u.email, u.role,
			       u.must_change_password, u.created_at
			from nibbs_sessions s
			join nibbs_users u on u.id = s.user_id
			where s.token_hash = ${hashToken(token)}
			  and s.expires_at > now()
			limit 1
		`,
	)) as UserRow[];

	const row = rows[0];
	if (!row) return null;

	return toPublicUser({
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		email: row.email,
		passwordHash: "",
		role: row.role,
		mustChangePassword: row.must_change_password,
		createdAt: row.created_at,
	});
}

/** Delete every session for a user (used after a password change). */
export async function deleteUserSessions(userId: string): Promise<void> {
	const sql = requireSql();
	await withRetry(
		() => sql`delete from nibbs_sessions where user_id = ${userId}`,
	);
}
