import type { UserRole } from "../types/user.ts";

/**
 * Who may change what, as pure predicates.
 *
 * These exist so a rule is named once and imported by both sides of the wire:
 * the route handler that enforces it and the screen that decides whether to
 * render the controls. A screen that re-implements the rule inline is how a
 * button ends up enabled for somebody the API will refuse.
 *
 * Client-safe: types only, no server imports.
 */

/**
 * The master bank list and posted collateral (NIBBS Settings).
 *
 * Read by everyone, written by admins only. The list feeds every settlement
 * audit, so a wrong collateral figure silently changes every breach calculation
 * for the whole team — it is shared reference data, not personal settings.
 *
 * An absent or unrecognised role is never an editor: a caller that cannot prove
 * it is an admin is treated as one that is not.
 */
export function canEditMasterBanks(role: UserRole | null | undefined): boolean {
	return role === "admin";
}
