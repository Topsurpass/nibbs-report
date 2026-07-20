// Applies src/services/db/schema.sql to the Neon database.
//
// Reads DATABASE_URL from the process env first (Vercel/CI), then falls back to
// .env.local so `npm run db:push` works locally without exporting the var. Uses
// the @neondatabase/serverless HTTP driver, so no local `psql` is required. The
// schema is idempotent, so this is safe to run repeatedly.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = new URL("..", import.meta.url);

/** Minimal .env parser — just enough to recover DATABASE_URL when not exported. */
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
		// No .env.local — rely on the ambient environment.
	}
}

loadEnvLocal();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
	console.error(
		"DATABASE_URL is not set. Add it to .env.local or export it, then re-run.",
	);
	process.exit(1);
}

const schemaPath = fileURLToPath(new URL("src/services/db/schema.sql", root));
const schema = readFileSync(schemaPath, "utf8");

// Strip line comments, then split into individual statements (the HTTP driver
// runs one statement per request).
const statements = schema
	.split("\n")
	.map((line) => line.replace(/--.*$/, ""))
	.join("\n")
	.split(";")
	.map((s) => s.trim())
	.filter(Boolean);

const sql = neon(url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run a statement, retrying transient network/fetch failures with backoff. */
async function runWithRetry(statement, attempts = 6) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await sql.query(statement);
			return;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (attempt === attempts) throw err;
			const wait = Math.min(500 * 2 ** (attempt - 1), 8000);
			console.warn(
				`  … retry ${attempt}/${attempts - 1} after "${message}" (waiting ${wait}ms)`,
			);
			await sleep(wait);
		}
	}
}

try {
	for (const statement of statements) {
		await runWithRetry(statement);
		console.log("✓", statement.split("\n")[0].slice(0, 70));
	}
	console.log(`\nSchema applied — ${statements.length} statement(s) ok.`);
} catch (err) {
	console.error(
		"\nFailed to apply schema:",
		err instanceof Error ? err.message : err,
	);
	process.exit(1);
}
