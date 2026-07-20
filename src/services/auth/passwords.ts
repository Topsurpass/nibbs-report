import {
	randomBytes,
	randomInt,
	scrypt as scryptCb,
	timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing and generation — pure Node crypto, no external dependency.
 *
 * Hashes use scrypt (memory-hard, in Node's stdlib) with a per-password random
 * salt. The stored string is self-describing:  `scrypt$<saltHex>$<hashHex>`, so
 * verification needs nothing but the stored value. Comparison is constant-time.
 */

const scrypt = promisify(scryptCb) as (
	password: string | Buffer,
	salt: string | Buffer,
	keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

/** Hash a plaintext password for storage. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const derived = await scrypt(password, salt, KEYLEN);
	return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Verify a plaintext password against a stored `scrypt$salt$hash` string. */
export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 3 || parts[0] !== "scrypt") return false;

	const salt = Buffer.from(parts[1], "hex");
	const expected = Buffer.from(parts[2], "hex");
	if (salt.length === 0 || expected.length === 0) return false;

	const derived = await scrypt(password, salt, expected.length);
	// Lengths always match here, but timingSafeEqual requires equal lengths.
	return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Unambiguous alphabet — no 0/O/1/I/l — for a readable one-time password.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Generate a readable one-time password (default 12 chars). */
export function generatePassword(length = 12): string {
	let out = "";
	for (let i = 0; i < length; i++) {
		out += ALPHABET[randomInt(ALPHABET.length)];
	}
	return out;
}
