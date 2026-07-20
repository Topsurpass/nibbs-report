// Seeds (or resets) the first admin account and emails the generated password.
//
//   npm run seed:admin           # create the admin if it doesn't exist
//   npm run seed:admin -- --reset # re-issue a new one-time password to the admin
//
// Reads config from the environment, falling back to .env.local:
//   ADMIN_EMAIL, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
//   DATABASE_URL, GMAIL_USER, GMAIL_APP_PASSWORD
//   APP_URL (optional; login link — defaults to http://localhost:3000)
//
// The password hash format matches src/services/auth/passwords.ts exactly
// (scrypt$<saltHex>$<hashHex>, keylen 64, 16-byte salt) so the app can verify it.

import { readFileSync } from "node:fs";
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import nodemailer from "nodemailer";

const root = new URL("..", import.meta.url);

function loadEnvLocal() {
	try {
		const text = readFileSync(new URL(".env.local", root), "utf8");
		for (const line of text.split("\n")) {
			const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
			if (!m) continue;
			const key = m[1];
			let value = m[2].trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (!(key in process.env)) process.env[key] = value;
		}
	} catch {
		// rely on ambient env
	}
}

loadEnvLocal();

const reset = process.argv.includes("--reset");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const firstName = (process.env.ADMIN_FIRST_NAME || "Admin").trim();
const lastName = (process.env.ADMIN_LAST_NAME || "User").trim();
const url = process.env.DATABASE_URL?.trim();
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

if (!url) {
	console.error("DATABASE_URL is not set. Add it to .env.local, then re-run.");
	process.exit(1);
}
if (!email) {
	console.error("ADMIN_EMAIL is not set. Add it to .env.local, then re-run.");
	process.exit(1);
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 12) {
	let out = "";
	for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
	return out;
}

function hashPassword(password) {
	const salt = randomBytes(16);
	const derived = scryptSync(password, salt, 64);
	return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function emailPassword(password) {
	const user = process.env.GMAIL_USER?.trim();
	const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
	if (!user || !pass) {
		console.warn("GMAIL_USER / GMAIL_APP_PASSWORD not set — printing password instead of emailing.");
		return false;
	}
	const loginUrl = `${appUrl}/login`;
	try {
		await nodemailer.createTransport({ service: "gmail", auth: { user, pass } }).sendMail({
			from: `"NIBBS Settlement Auditor" <${user}>`,
			to: email,
			subject: reset
				? "Your NIBBS Settlement Auditor admin password was reset"
				: "Your NIBBS Settlement Auditor admin account",
			text: [
				`Hi ${firstName},`,
				"",
				reset
					? "Your admin password was reset. Use the temporary password below to sign in, then set a new one."
					: "Your admin account is ready. Use the temporary password below to sign in, then set your own password.",
				"",
				`Sign in:   ${loginUrl}`,
				`Email:     ${email}`,
				`Password:  ${password}`,
				"",
				"You'll be asked to choose a new password immediately after signing in.",
				"",
				"— NIBBS Settlement Auditor",
			].join("\n"),
		});
		return true;
	} catch (err) {
		console.warn("Email send failed:", err instanceof Error ? err.message : err);
		return false;
	}
}

const sql = neon(url);
const password = generatePassword();
const passwordHash = hashPassword(password);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Retry transient Neon cold-start / WSL2 fetch stalls with backoff. */
async function withRetry(fn, attempts = 6) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt === attempts) throw err;
			const wait = Math.min(500 * 2 ** (attempt - 1), 8000);
			const message = err instanceof Error ? err.message : String(err);
			console.warn(`  … retry ${attempt}/${attempts - 1} after "${message}" (waiting ${wait}ms)`);
			await sleep(wait);
		}
	}
}

try {
	const existing = await withRetry(
		() => sql`select id from nibbs_users where email = ${email} limit 1`,
	);

	if (existing.length > 0) {
		if (!reset) {
			console.log(`Admin ${email} already exists. Re-run with --reset to issue a new password.`);
			process.exit(0);
		}
		await withRetry(
			() => sql`
				update nibbs_users
				set password_hash = ${passwordHash}, must_change_password = true, updated_at = now()
				where email = ${email}
			`,
		);
		console.log(`✓ Reset password for admin ${email}.`);
	} else {
		await withRetry(
			() => sql`
				insert into nibbs_users (first_name, last_name, email, password_hash, role, must_change_password)
				values (${firstName}, ${lastName}, ${email}, ${passwordHash}, 'admin', true)
			`,
		);
		console.log(`✓ Created admin ${email}.`);
	}

	const emailed = await emailPassword(password);
	if (emailed) {
		console.log(`✓ Credentials emailed to ${email}.`);
	} else {
		console.log("\n────────────────────────────────────────");
		console.log(`  Email:    ${email}`);
		console.log(`  Password: ${password}`);
		console.log(`  Sign in:  ${appUrl}/login`);
		console.log("────────────────────────────────────────\n");
	}
	console.log("The admin must change this password on first sign-in.");
} catch (err) {
	console.error("Failed to seed admin:", err instanceof Error ? err.message : err);
	process.exit(1);
}
