import type { NightDate } from "@/lib/attendance/nightWindow";

/**
 * Delete one analyst's night from the register.
 *
 * Shared by the correction dialog and the Remove button on each row, so the two
 * paths cannot drift on error handling. The route re-checks the caller is an
 * admin — this is a convenience, never the guard.
 *
 * Resolves `false` when the row was already gone (a second click, or another
 * admin got there first), which is not an error: the caller's intent is
 * satisfied either way.
 */
export async function requestNightRemoval(
	userId: string,
	nightDate: NightDate,
): Promise<boolean> {
	const params = new URLSearchParams({ userId, nightDate });

	let res: Response;
	try {
		res = await fetch(`/api/attendance/entries?${params}`, { method: "DELETE" });
	} catch {
		throw new Error("Network error. Check your connection and try again.");
	}

	// A 503 from the route still carries JSON; a proxy error page does not.
	const data = (await res.json().catch(() => null)) as
		| { ok?: boolean; removed?: boolean; error?: string }
		| null;

	if (!res.ok || !data?.ok) {
		throw new Error(data?.error ?? "Couldn't remove that night.");
	}
	return data.removed !== false;
}
