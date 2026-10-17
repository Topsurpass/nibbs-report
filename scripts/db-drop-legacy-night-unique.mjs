// Contract step for afternoon duty. Run ONCE, only after the code that writes
// `on conflict (user_id, night_date, shift)` is deployed everywhere.
//
// Before afternoon duty the register allowed one row per analyst per date
// (constraint nibbs_night_attendance_user_id_night_date_key). `npm run db:push`
// already added the per-shift unique index; this drops the old date-only
// constraint so one analyst can have a night AND an afternoon on the same date.
//
// Dropping it earlier would break the previously deployed code, whose
// `on conflict (user_id, night_date)` needs that exact constraint to exist.
//
//   npm run db:contract-afternoon
//
// Idempotent: safe to run again. Refuses to run if the replacement index is
// missing, so the table is never left without a uniqueness guard.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

for (const line of (() => {
	try {
		return readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n");
	} catch {
		return [];
	}
})()) {
	const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
	if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
	console.error("DATABASE_URL is not set. Add it to .env.local or export it, then re-run.");
	process.exit(1);
}
const sql = neon(url);

const replacement = await sql`
	select 1 from pg_indexes
	where tablename = 'nibbs_night_attendance' and indexname = 'nibbs_night_attendance_user_date_shift_key'
`;
if (replacement.length === 0) {
	console.error("The per-shift unique index is missing. Run `npm run db:push` first.");
	process.exit(1);
}

await sql`alter table nibbs_night_attendance drop constraint if exists nibbs_night_attendance_user_id_night_date_key`;

const left = await sql`
	select conname from pg_constraint
	where conrelid = 'nibbs_night_attendance'::regclass and conname = 'nibbs_night_attendance_user_id_night_date_key'
`;
if (left.length > 0) {
	console.error("The legacy constraint is still there. Nothing was changed.");
	process.exit(1);
}
console.log("✓ Legacy (user_id, night_date) constraint dropped. A night and an afternoon can now share a date.");
