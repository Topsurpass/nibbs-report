import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import type { DutyDate, Shift } from "@/lib/attendance/shifts";

/**
 * Persistence for web push: device subscriptions, the send log (trace and
 * once-only guard) and "not on duty" dismissals. No scheduling rules here;
 * those live in `lib/push/schedule.ts`.
 */

export interface PushDevice {
	id: string;
	userId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface NewSubscription {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

interface DeviceRow {
	id: string;
	user_id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
}

const toDevice = (r: DeviceRow): PushDevice => ({
	id: r.id,
	userId: r.user_id,
	endpoint: r.endpoint,
	p256dh: r.p256dh,
	auth: r.auth,
});

/** Save this device for this user. A device that changes hands moves to the new user. */
export async function saveSubscription(userId: string, sub: NewSubscription, userAgent: string | null): Promise<void> {
	const sql = requireSql();
	await withRetry(
		() => sql`
			insert into nibbs_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
			values (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent})
			on conflict (endpoint) do update
			set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
			    user_agent = excluded.user_agent
		`,
	);
}

export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
	const sql = requireSql();
	await withRetry(() => sql`delete from nibbs_push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`);
}

/** Drop a device the push service says is gone (404/410). */
export async function deleteDevice(id: string): Promise<void> {
	const sql = requireSql();
	await withRetry(() => sql`delete from nibbs_push_subscriptions where id = ${id}`);
}

export async function markDeviceOk(id: string): Promise<void> {
	const sql = requireSql();
	await withRetry(() => sql`update nibbs_push_subscriptions set last_ok_at = now() where id = ${id}`);
}

/** Devices for these users, or for everyone except one user. */
export async function devicesFor(target: { userIds: string[] } | { allExcept: string }): Promise<PushDevice[]> {
	const sql = requireSql();
	const rows = (await withRetry(() =>
		"userIds" in target
			? sql`select id, user_id, endpoint, p256dh, auth from nibbs_push_subscriptions where user_id = any(${target.userIds})`
			: sql`select id, user_id, endpoint, p256dh, auth from nibbs_push_subscriptions where user_id <> ${target.allExcept}`,
	)) as DeviceRow[];
	return rows.map(toDevice);
}

export async function hasDevice(userId: string, endpoint: string): Promise<boolean> {
	const sql = requireSql();
	const rows = await withRetry(
		() => sql`select 1 from nibbs_push_subscriptions where user_id = ${userId} and endpoint = ${endpoint} limit 1`,
	);
	return rows.length > 0;
}

/** Users with at least one device. */
export async function subscriberIds(): Promise<string[]> {
	const sql = requireSql();
	const rows = (await withRetry(() => sql`select distinct user_id from nibbs_push_subscriptions`)) as { user_id: string }[];
	return rows.map((r) => r.user_id);
}

/**
 * Claim a once-only reminder key. Returns the log id when this caller won the
 * claim, or null when it was already claimed (sent, or being sent by another run).
 */
export async function claimKey(userId: string, kind: string, key: string): Promise<string | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			insert into nibbs_push_log (user_id, kind, dedup_key)
			values (${userId}, ${kind}, ${key})
			on conflict (dedup_key) do nothing
			returning id
		`,
	)) as { id: string }[];
	return rows[0]?.id ?? null;
}

/** Keys already claimed among these candidates. */
export async function claimedKeys(keys: string[]): Promise<Set<string>> {
	if (keys.length === 0) return new Set();
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select dedup_key from nibbs_push_log where dedup_key = any(${keys})`,
	)) as { dedup_key: string }[];
	return new Set(rows.map((r) => r.dedup_key));
}

/** Start a log row for a send with no dedup key (team alert, test). */
export async function logSend(userId: string, kind: string): Promise<string> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`insert into nibbs_push_log (user_id, kind) values (${userId}, ${kind}) returning id`,
	)) as { id: string }[];
	return rows[0].id;
}

export async function finishLog(
	id: string,
	result: { status: "sent" | "failed" | "no-device"; devices: number; error?: string },
): Promise<void> {
	const sql = requireSql();
	await withRetry(
		() => sql`
			update nibbs_push_log
			set status = ${result.status}, devices = ${result.devices}, error = ${result.error ?? null}
			where id = ${id}
		`,
	);
}

export async function addDismissal(userId: string, shift: Shift, date: DutyDate): Promise<void> {
	const sql = requireSql();
	await withRetry(
		() => sql`
			insert into nibbs_shift_dismissals (user_id, shift, night_date)
			values (${userId}, ${shift}, ${date})
			on conflict do nothing
		`,
	);
}

export async function isDismissed(userId: string, shift: Shift, date: DutyDate): Promise<boolean> {
	const sql = requireSql();
	const rows = await withRetry(
		() => sql`
			select 1 from nibbs_shift_dismissals
			where user_id = ${userId} and shift = ${shift} and night_date = ${date}
			limit 1
		`,
	);
	return rows.length > 0;
}

/** `${userId}:${shift}:${date}` for every dismissal on these dates. */
export async function dismissalsOn(dates: DutyDate[]): Promise<Set<string>> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			select user_id, shift, to_char(night_date, 'YYYY-MM-DD') as night_date
			from nibbs_shift_dismissals where night_date = any(${dates}::date[])
		`,
	)) as { user_id: string; shift: Shift; night_date: string }[];
	return new Set(rows.map((r) => `${r.user_id}:${r.shift}:${r.night_date}`));
}
