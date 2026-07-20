import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque token helpers shared by sessions and password resets. The raw token
 * goes to the client (cookie or email link); only its SHA-256 is stored, so a
 * database leak can't be replayed.
 */

/** A random 256-bit token as hex (64 chars). */
export function randomToken(): string {
	return randomBytes(32).toString("hex");
}

/** SHA-256 of a token, hex — the value stored/looked up in the DB. */
export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
