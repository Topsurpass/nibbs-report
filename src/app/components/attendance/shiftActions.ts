import type { Shift } from "@/lib/attendance/shifts";
import type { AttendanceEntry } from "@/lib/attendance/types";

export type ShiftAction = "sign-in" | "sign-out";

export interface ShiftActionResult {
	ok: boolean;
	/** Server's message on success, or why it refused. */
	message: string;
	/** The row the server returned, refusal included: adopt it either way. */
	entry?: AttendanceEntry;
	locked?: boolean;
}

/**
 * Sign in to / out of a shift. Shared by the register's sign-in card and the
 * reminder pop-up so both send exactly the same request and read the reply
 * the same way. The server decides the shift date from its own clock.
 */
export async function postShiftAction(action: ShiftAction, shift: Shift): Promise<ShiftActionResult> {
	try {
		const res = await fetch(`/api/attendance/${action}?shift=${shift}`, { method: "POST" });
		const body = (await res.json()) as {
			ok: boolean;
			error?: string;
			message?: string;
			locked?: boolean;
			entry?: AttendanceEntry;
		};
		return body.ok
			? { ok: true, message: body.message ?? "", entry: body.entry, locked: body.locked }
			: { ok: false, message: body.error ?? "That didn't work. Try again.", entry: body.entry, locked: body.locked };
	} catch {
		return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
	}
}
