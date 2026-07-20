import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon connection for the NIBBS app.
 *
 * Uses the HTTP driver (`neon(...)`) — a tagged-template SQL function that needs
 * no pooling setup and runs well in route handlers. The `.transaction([...])`
 * helper on the returned client batches several statements atomically (used by
 * the bank bulk-sync). The client is created lazily and memoized.
 *
 * When `DATABASE_URL` is absent (CI, unit tests, a dev box without a DB) this
 * returns `null` so callers can surface a clear error instead of the driver
 * throwing on construction.
 */

let cached: NeonQueryFunction<false, false> | null | undefined;

export function getSql(): NeonQueryFunction<false, false> | null {
	if (cached !== undefined) return cached;

	const url = process.env.DATABASE_URL?.trim();
	if (!url) {
		console.warn(
			"[db] DATABASE_URL not set — database features disabled. Add it to .env.local (see src/services/db/schema.sql).",
		);
		cached = null;
		return cached;
	}

	cached = neon(url);
	return cached;
}

/** Like getSql() but throws when unconfigured — for paths that require a DB. */
export function requireSql(): NeonQueryFunction<false, false> {
	const sql = getSql();
	if (!sql) {
		throw new Error("DATABASE_URL is not configured");
	}
	return sql;
}

/** True when a database is configured. */
export function isDbConfigured(): boolean {
	return Boolean(process.env.DATABASE_URL?.trim());
}
