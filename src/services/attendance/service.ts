import { isMonthKey, type MonthKey } from "@/lib/attendance/nightWindow";
import type { AttendanceEntry, AttendancePerson } from "@/lib/attendance/types";
import { listUsers, type PublicUser } from "@/services/auth/users-repository";
import { listAttendance } from "./repository";

/**
 * Reads the register for a scope, applying the one access rule that matters:
 * an analyst sees only their own nights, an admin can ask for everyone's.
 */

export type Scope = "me" | "all";

export function toPerson(user: PublicUser | AttendancePerson): AttendancePerson {
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
	};
}

export function parseScope(raw: string | null, isAdmin: boolean): Scope {
	return raw === "all" && isAdmin ? "all" : "me";
}

export function parseMonth(raw: string | null, fallback: MonthKey): MonthKey {
	return isMonthKey(raw) ? raw : fallback;
}

export interface Register {
	month: MonthKey;
	scope: Scope;
	people: AttendancePerson[];
	entries: AttendanceEntry[];
}

export async function loadRegister(
	viewer: PublicUser,
	month: MonthKey,
	scope: Scope,
): Promise<Register> {
	if (scope === "all") {
		const [users, entries] = await Promise.all([listUsers(), listAttendance({ month })]);
		return { month, scope, people: users.map(toPerson), entries };
	}
	const entries = await listAttendance({ month, userId: viewer.id });
	return { month, scope, people: [toPerson(viewer)], entries };
}
