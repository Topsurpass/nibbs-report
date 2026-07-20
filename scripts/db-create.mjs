// Creates the dedicated `nibbsreport` database in the Neon project, so NIBBS no
// longer shares nexemz's `neondb`. Idempotent: skips creation if it exists.
//
//   npm run db:create
//
// CREATE DATABASE cannot run inside a transaction and has no IF NOT EXISTS, so
// we check pg_database first and issue a bare CREATE (the HTTP driver runs each
// statement in autocommit). Connects to the ADMIN database (neondb) using the
// existing DATABASE_URL's host + credentials; only the target db name differs.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const root = new URL("..", import.meta.url);
const TARGET_DB = "nibbsreport";

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

// Prefer the unpooled URL for DDL; fall back to DATABASE_URL. Point it at the
// admin database (whatever db the URL currently names — usually neondb) so we
// can create a sibling database.
const source = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").trim();
if (!source) {
	console.error("DATABASE_URL is not set. Add it to .env.local, then re-run.");
	process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, attempts = 6) {
	let last;
	for (let i = 1; i <= attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			last = err;
			if (i === attempts) break;
			const wait = Math.min(500 * 2 ** (i - 1), 8000);
			console.warn(`  … retry ${i}/${attempts - 1} (${err instanceof Error ? err.message : err}) waiting ${wait}ms`);
			await sleep(wait);
		}
	}
	throw last;
}

const sql = neon(source);

try {
	const existing = await withRetry(
		() => sql`select 1 from pg_database where datname = ${TARGET_DB}`,
	);
	if (existing.length > 0) {
		console.log(`✓ Database "${TARGET_DB}" already exists — nothing to do.`);
		process.exit(0);
	}

	// Identifier is a constant literal, not user input — safe to interpolate.
	// A response-level fetch stall (WSL2) can drop the reply after the CREATE
	// already ran, so a retry sees "already exists" — treat that as success.
	try {
		await withRetry(() => sql.query(`create database ${TARGET_DB}`));
	} catch (err) {
		const m = err instanceof Error ? err.message : String(err);
		if (!/already exists/i.test(m)) throw err;
	}
	console.log(`✓ Created database "${TARGET_DB}".`);
	console.log(`\nNext: point DATABASE_URL at "${TARGET_DB}" in .env.local, then run:`);
	console.log("  npm run db:push");
	console.log("  npm run seed:admin");
} catch (err) {
	const message = err instanceof Error ? err.message : String(err);
	console.error(`\nFailed to create "${TARGET_DB}": ${message}`);
	if (/permission|denied|not allowed|createdb/i.test(message)) {
		console.error(
			`\nThe role may lack CREATEDB. Create it in the Neon console (or with a\nsuperuser): CREATE DATABASE ${TARGET_DB};  then repoint DATABASE_URL and run db:push.`,
		);
	}
	process.exit(1);
}
