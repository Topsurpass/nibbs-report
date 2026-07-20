import { getSessionUser } from "./sessions";
import type { PublicUser } from "./users-repository";

/**
 * Route-handler auth guards. Each returns either `{ user }` or `{ response }`;
 * the handler forwards the response when present:
 *
 *   const auth = await requireUser();
 *   if ("response" in auth) return auth.response;
 *   const user = auth.user;
 */

export type GuardResult = { user: PublicUser } | { response: Response };

export async function requireUser(): Promise<GuardResult> {
	const user = await getSessionUser();
	if (!user) {
		return {
			response: Response.json(
				{ ok: false, error: "Not signed in." },
				{ status: 401 },
			),
		};
	}
	return { user };
}

export async function requireAdmin(): Promise<GuardResult> {
	const result = await requireUser();
	if ("response" in result) return result;
	if (result.user.role !== "admin") {
		return {
			response: Response.json(
				{ ok: false, error: "Admins only." },
				{ status: 403 },
			),
		};
	}
	return result;
}
