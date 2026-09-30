/** Client-facing user shapes — no server imports, safe in client components. */

export type UserRole = "admin" | "analyst";

export interface AuthUser {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	role: UserRole;
	mustChangePassword: boolean;
	/** False for a revoked account — see users-repository.ts on the server. */
	isActive: boolean;
	createdAt: string;
}
