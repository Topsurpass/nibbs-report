import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import { hashToken, randomToken } from "./tokens";

/**
 * Single-use, time-limited password-reset tokens (table `nibbs_password_resets`).
 * `createPasswordReset` mints a token and emails it (raw); the DB keeps only its
 * hash. `consumePasswordReset` validates + marks it used in one atomic UPDATE,
 * so a token can't be redeemed twice or after it expires.
 */

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function createPasswordReset(
	userId: string,
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomToken();
	const expiresAt = new Date(Date.now() + RESET_TTL_MS);
	const sql = requireSql();
	await withRetry(
		() => sql`
			insert into nibbs_password_resets (user_id, token_hash, expires_at)
			values (${userId}, ${hashToken(token)}, ${expiresAt.toISOString()})
		`,
	);
	return { token, expiresAt };
}

/**
 * Redeem a reset token: returns the owning user id if the token is valid,
 * unexpired, and unused (marking it used in the same statement), else null.
 */
export async function consumePasswordReset(token: string): Promise<string | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			update nibbs_password_resets
			set used_at = now()
			where token_hash = ${hashToken(token)}
			  and used_at is null
			  and expires_at > now()
			returning user_id
		`,
	)) as { user_id: string }[];
	return rows[0]?.user_id ?? null;
}
