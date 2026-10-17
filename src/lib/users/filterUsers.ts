import type { AuthUser } from "@/types/user";

export type UserFilter = "all" | "admin" | "analyst" | "pending" | "revoked";

export const USER_FILTERS: { id: UserFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "admin", label: "Admins" },
	{ id: "analyst", label: "Analysts" },
	{ id: "pending", label: "Pending first login" },
	{ id: "revoked", label: "Revoked" },
];

function matchesFilter(u: Pick<AuthUser, "role" | "isActive" | "mustChangePassword">, filter: UserFilter): boolean {
	switch (filter) {
		case "admin":
			return u.role === "admin";
		case "analyst":
			return u.role === "analyst";
		case "pending":
			return u.isActive && u.mustChangePassword;
		case "revoked":
			return !u.isActive;
		default:
			return true;
	}
}

/** Name or email contains every search term (case-insensitive), and the user is in the filter. */
export function filterUsers<T extends Pick<AuthUser, "firstName" | "lastName" | "email" | "role" | "isActive" | "mustChangePassword">>(
	users: T[],
	query: string,
	filter: UserFilter,
): T[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	return users.filter((u) => {
		if (!matchesFilter(u, filter)) return false;
		const hay = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase();
		return terms.every((t) => hay.includes(t));
	});
}

/** How many users each filter would show, for the filter chips. */
export function countByFilter<T extends Pick<AuthUser, "role" | "isActive" | "mustChangePassword">>(users: T[]): Record<UserFilter, number> {
	const out = { all: 0, admin: 0, analyst: 0, pending: 0, revoked: 0 } as Record<UserFilter, number>;
	for (const u of users) for (const f of USER_FILTERS) if (matchesFilter(u, f.id)) out[f.id]++;
	return out;
}
