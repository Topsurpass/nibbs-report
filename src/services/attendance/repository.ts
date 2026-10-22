import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import { monthBounds, type MonthKey, type NightDate } from "@/lib/attendance/nightWindow";
import type { Shift } from "@/lib/attendance/shifts";
import type { AttendanceEntry, AttendanceSource } from "@/lib/attendance/types";

/**
 * Persistence for the duty register (`nibbs_night_attendance`, night and
 * afternoon shifts, distinguished by `shift`).
 *
 * No clock logic lives here — which night an instant belongs to is decided by
 * `lib/attendance/nightWindow.ts` and passed in. This module only reads and
 * writes rows, so the window rules stay in one tested place.
 */

interface Row {
	id: string;
	user_id: string;
	shift: Shift;
	night_date: string;
	signed_in_at: string | Date;
	signed_out_at: string | Date | null;
	source: AttendanceSource;
	note: string | null;
	recorded_by: string | null;
}

/**
 * `night_date` is read with `to_char` rather than the driver's `date` parser:
 * a `date` deserialised into a JS Date lands at UTC midnight and can render as
 * the previous day once a local timezone is applied. The night key must survive
 * the round trip byte for byte.
 */
const SELECT_COLUMNS = `
	id,
	user_id,
	shift,
	to_char(night_date, 'YYYY-MM-DD') as night_date,
	signed_in_at,
	signed_out_at,
	source,
	note,
	recorded_by
`;

function toIso(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toEntry(row: Row): AttendanceEntry {
	return {
		id: row.id,
		userId: row.user_id,
		shift: row.shift,
		nightDate: row.night_date,
		signedInAt: toIso(row.signed_in_at),
		signedOutAt: row.signed_out_at === null ? null : toIso(row.signed_out_at),
		source: row.source,
		note: row.note,
		recordedBy: row.recorded_by,
	};
}

export interface ListOptions {
	month: MonthKey;
	/** Omit to read the whole team (admin view). */
	userId?: string;
}

/** Every shift (night and afternoon) in a month, for one analyst or for everyone. */
export async function listAttendance({ month, userId }: ListOptions): Promise<AttendanceEntry[]> {
	const sql = requireSql();
	const { first, last } = monthBounds(month);

	const rows = (await withRetry(() =>
		userId
			? sql`
				select ${sql.unsafe(SELECT_COLUMNS)}
				from nibbs_night_attendance
				where night_date between ${first} and ${last} and user_id = ${userId}
				order by night_date desc, shift
			`
			: sql`
				select ${sql.unsafe(SELECT_COLUMNS)}
				from nibbs_night_attendance
				where night_date between ${first} and ${last}
				order by night_date desc, shift
			`,
	)) as Row[];

	return rows.map(toEntry);
}

/** Every shift row on these dates, for everyone (push reminders). */
export async function listEntriesOn(dates: NightDate[]): Promise<AttendanceEntry[]> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select ${sql.unsafe(SELECT_COLUMNS)}
			from nibbs_night_attendance
			where night_date = any(${dates}::date[])
		`,
	)) as Row[];
	return rows.map(toEntry);
}

/** The row for one analyst on one shift, if any. */
export async function getEntry(
	userId: string,
	nightDate: NightDate,
	shift: Shift,
): Promise<AttendanceEntry | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select ${sql.unsafe(SELECT_COLUMNS)}
			from nibbs_night_attendance
			where user_id = ${userId} and night_date = ${nightDate} and shift = ${shift}
			limit 1
		`,
	)) as Row[];
	return rows[0] ? toEntry(rows[0]) : null;
}

export interface SignInResult {
	/** False when the analyst had already signed in for this night. */
	created: boolean;
	entry: AttendanceEntry;
}

/**
 * Record a sign-in, or return the existing one.
 *
 * `on conflict do nothing` makes a double tap (or two tabs) idempotent at the
 * database rather than in a read-then-write that could interleave.
 */
export async function signIn(
	userId: string,
	nightDate: NightDate,
	shift: Shift,
	at: Date,
): Promise<SignInResult> {
	const sql = requireSql();
	const inserted = (await withRetry(
		() => sql`
			insert into nibbs_night_attendance (user_id, night_date, shift, signed_in_at, source)
			values (${userId}, ${nightDate}, ${shift}, ${at.toISOString()}, 'self')
			on conflict (user_id, night_date, shift) do nothing
			returning ${sql.unsafe(SELECT_COLUMNS)}
		`,
	)) as Row[];

	if (inserted[0]) return { created: true, entry: toEntry(inserted[0]) };

	const existing = await getEntry(userId, nightDate, shift);
	if (!existing) {
		// The conflicting row vanished between the insert and the read. Vanishingly
		// unlikely, but returning a fake success would be worse than a clear error.
		throw new Error("Sign-in conflicted with a row that no longer exists");
	}
	return { created: false, entry: existing };
}

export interface SignOutResult {
	/** False when the night was already closed. */
	updated: boolean;
	entry: AttendanceEntry | null;
}

/**
 * Close an open night. The `signed_out_at is null` guard means a second tap
 * cannot overwrite the first sign-out with a later time.
 */
export async function signOut(
	userId: string,
	nightDate: NightDate,
	shift: Shift,
	at: Date,
): Promise<SignOutResult> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			update nibbs_night_attendance
			set signed_out_at = ${at.toISOString()}, updated_at = now()
			where user_id = ${userId}
			  and night_date = ${nightDate}
			  and shift = ${shift}
			  and signed_out_at is null
			returning ${sql.unsafe(SELECT_COLUMNS)}
		`,
	)) as Row[];

	if (rows[0]) return { updated: true, entry: toEntry(rows[0]) };
	return { updated: false, entry: await getEntry(userId, nightDate, shift) };
}

export interface AdminEntryInput {
	userId: string;
	nightDate: NightDate;
	shift: Shift;
	signedInAt: Date;
	signedOutAt: Date | null;
	note: string | null;
	recordedBy: string;
}

/**
 * Add or correct a night on someone's behalf. Always stamped `source = 'admin'`
 * with who did it, so a corrected register still says what actually happened.
 */
export async function upsertAdminEntry(input: AdminEntryInput): Promise<AttendanceEntry> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			insert into nibbs_night_attendance
				(user_id, night_date, shift, signed_in_at, signed_out_at, source, note, recorded_by)
			values (
				${input.userId},
				${input.nightDate},
				${input.shift},
				${input.signedInAt.toISOString()},
				${input.signedOutAt ? input.signedOutAt.toISOString() : null},
				'admin',
				${input.note},
				${input.recordedBy}
			)
			on conflict (user_id, night_date, shift) do update
			set signed_in_at  = excluded.signed_in_at,
			    signed_out_at = excluded.signed_out_at,
			    source        = 'admin',
			    note          = excluded.note,
			    recorded_by   = excluded.recorded_by,
			    updated_at    = now()
			returning ${sql.unsafe(SELECT_COLUMNS)}
		`,
	)) as Row[];
	return toEntry(rows[0]);
}

/** Remove one shift. Returns false when there was nothing to remove. */
export async function deleteEntry(userId: string, nightDate: NightDate, shift: Shift): Promise<boolean> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			delete from nibbs_night_attendance
			where user_id = ${userId} and night_date = ${nightDate} and shift = ${shift}
			returning id
		`,
	)) as { id: string }[];
	return rows.length > 0;
}
