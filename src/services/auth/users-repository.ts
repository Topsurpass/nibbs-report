import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";

/** A user role. Admins additionally manage other users. */
export type UserRole = "admin" | "analyst";

/** Full user row (never leaves the server with the hash attached). */
export interface UserRecord {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	passwordHash: string;
	role: UserRole;
	mustChangePassword: boolean;
	createdAt: string;
}

/** Safe, client-facing view of a user — no password hash. */
export interface PublicUser {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	role: UserRole;
	mustChangePassword: boolean;
	createdAt: string;
}

interface UserRow {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	password_hash: string;
	role: UserRole;
	must_change_password: boolean;
	created_at: string;
}

function toRecord(row: UserRow): UserRecord {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		email: row.email,
		passwordHash: row.password_hash,
		role: row.role,
		mustChangePassword: row.must_change_password,
		createdAt: row.created_at,
	};
}

/** Strip the hash for anything that crosses to the client. */
export function toPublicUser(u: UserRecord): PublicUser {
	const { passwordHash: _hash, ...rest } = u;
	void _hash;
	return rest;
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() =>
			sql`select * from nibbs_users where email = ${normalizeEmail(email)} limit 1`,
	)) as UserRow[];
	return rows[0] ? toRecord(rows[0]) : null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select * from nibbs_users where id = ${id} limit 1`,
	)) as UserRow[];
	return rows[0] ? toRecord(rows[0]) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select * from nibbs_users order by created_at asc`,
	)) as UserRow[];
	return rows.map((r) => toPublicUser(toRecord(r)));
}

export interface NewUser {
	firstName: string;
	lastName: string;
	email: string;
	passwordHash: string;
	role?: UserRole;
	mustChangePassword?: boolean;
}

/** Insert a user. Throws on duplicate email (unique constraint). */
export async function createUser(input: NewUser): Promise<UserRecord> {
	const sql = requireSql();
	const role = input.role ?? "analyst";
	const mustChange = input.mustChangePassword ?? true;
	const rows = (await withRetry(
		() => sql`
			insert into nibbs_users
				(first_name, last_name, email, password_hash, role, must_change_password)
			values
				(${input.firstName}, ${input.lastName}, ${normalizeEmail(input.email)},
				 ${input.passwordHash}, ${role}, ${mustChange})
			returning *
		`,
	)) as UserRow[];
	return toRecord(rows[0]);
}

/** Set a new password hash and clear the force-change flag. */
export async function updatePassword(
	id: string,
	passwordHash: string,
): Promise<void> {
	const sql = requireSql();
	await withRetry(
		() => sql`
			update nibbs_users
			set password_hash = ${passwordHash},
			    must_change_password = false,
			    updated_at = now()
			where id = ${id}
		`,
	);
}

/** Replace a user's password and require them to change it again (admin reset). */
export async function resetUserPassword(
	id: string,
	passwordHash: string,
): Promise<void> {
	const sql = requireSql();
	await withRetry(
		() => sql`
			update nibbs_users
			set password_hash = ${passwordHash},
			    must_change_password = true,
			    updated_at = now()
			where id = ${id}
		`,
	);
}

export async function deleteUser(id: string): Promise<void> {
	const sql = requireSql();
	await withRetry(() => sql`delete from nibbs_users where id = ${id}`);
}

/** Number of admin accounts — used to prevent removing the last admin. */
export async function countAdmins(): Promise<number> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select count(*)::int as n from nibbs_users where role = 'admin'`,
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** Set a user's role. Returns the updated record, or null if not found. */
export async function setUserRole(
	id: string,
	role: UserRole,
): Promise<UserRecord | null> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`
			update nibbs_users
			set role = ${role}, updated_at = now()
			where id = ${id}
			returning *
		`,
	)) as UserRow[];
	return rows[0] ? toRecord(rows[0]) : null;
}
