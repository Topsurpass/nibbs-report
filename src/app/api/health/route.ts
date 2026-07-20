import { getSql } from "@/services/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment diagnostic — no secrets. Hit `/api/health` on any environment to
 * see what the runtime actually has: whether DATABASE_URL is set, which host +
 * database it points at (password never included), and whether a `select 1`
 * succeeds. Purpose: tell a 503 caused by a missing/misscoped env var apart from
 * one caused by an unreachable database.
 */
export async function GET() {
	const raw = process.env.DATABASE_URL?.trim();

	let dbHost: string | null = null;
	let dbName: string | null = null;
	let urlParseError: string | null = null;
	if (raw) {
		try {
			const u = new URL(raw);
			dbHost = u.hostname;
			dbName = u.pathname.replace(/^\//, "") || null;
		} catch (e) {
			urlParseError = e instanceof Error ? e.message : "unparseable DATABASE_URL";
		}
	}

	let dbOk = false;
	let dbError: string | null = null;
	let dbMs: number | null = null;
	const sql = getSql();
	if (sql) {
		const started = Date.now();
		try {
			// Single attempt (no retry) with a hard timeout, so this never hangs.
			await Promise.race([
				sql`select 1`,
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("timeout after 8s")), 8000),
				),
			]);
			dbOk = true;
		} catch (e) {
			dbError = e instanceof Error ? e.message : String(e);
		} finally {
			dbMs = Date.now() - started;
		}
	}

	return Response.json(
		{
			ok: dbOk,
			env: {
				hasDatabaseUrl: Boolean(raw),
				dbHost,
				dbName, // should be "nibbsreport"
				usesPooler: dbHost?.includes("-pooler") ?? null,
				urlParseError,
				hasGmailUser: Boolean(process.env.GMAIL_USER?.trim()),
				hasGmailAppPassword: Boolean(process.env.GMAIL_APP_PASSWORD?.trim()),
				sessionCookieSecure: process.env.SESSION_COOKIE_SECURE ?? null,
				vercelEnv: process.env.VERCEL_ENV ?? null, // production | preview | development
				vercelRegion: process.env.VERCEL_REGION ?? null,
			},
			db: { ok: dbOk, ms: dbMs, error: dbError },
		},
		{ status: dbOk ? 200 : 503 },
	);
}
