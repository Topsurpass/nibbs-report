import type { UserRole } from "@/types/user";

/** Who's asking — used to scope report reads to the caller's own reports. */
export interface ReportScope {
	userId: string;
	role: UserRole;
}

/**
 * The `created_by` value a listing should be filtered to, or null for no filter.
 * Admins (and unscoped/system callers) see everything; analysts see only their own.
 * Pure and DB-free so the scoping rule is unit-testable in isolation.
 */
export function ownerFilter(scope?: ReportScope): string | null {
	if (!scope || scope.role === "admin") return null;
	return scope.userId;
}
