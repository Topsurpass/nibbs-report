import { redirect } from "next/navigation";
import DutyRegister, { type CurrentShift } from "@/app/components/attendance/DutyRegister";
import { currentMonth } from "@/lib/attendance/nightWindow";
import { SHIFTS, activeDutyDate, defaultShift, type Shift } from "@/lib/attendance/shifts";
import type { AttendanceEntry } from "@/lib/attendance/types";
import { getSessionUser } from "@/services/auth/sessions";
import { getEntry } from "@/services/attendance/repository";
import { loadRegister } from "@/services/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Duty register (night and afternoon shifts).
 *
 * Renders the current month and each shift's current row server-side so the
 * sign-in card is correct on first paint rather than after a round trip. Shift
 * dates are computed from the server clock — a device with a wrong clock must
 * not be able to open a window early.
 *
 * `activeDutyDate` includes each shift's sign-out grace (08:30-09:00 for a
 * night, 20:30-21:00 for an afternoon), matching the precedence SignInCard
 * uses client-side, so the sign-out button is there exactly when needed.
 */
export default async function AttendancePage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	const now = new Date();
	const month = currentMonth(now);

	let people = [{ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email }];
	let entries: AttendanceEntry[] = [];
	const current: Record<Shift, CurrentShift> = {
		night: { date: activeDutyDate("night", now), entry: null },
		afternoon: { date: activeDutyDate("afternoon", now), entry: null },
	};

	try {
		const [register, ...rows] = await Promise.all([
			loadRegister(user, month, "me"),
			...SHIFTS.map((shift) => {
				const date = current[shift].date;
				return date ? getEntry(user.id, date, shift) : Promise.resolve(null);
			}),
		]);
		people = register.people;
		entries = register.entries;
		SHIFTS.forEach((shift, i) => {
			current[shift].entry = rows[i];
		});
	} catch (err) {
		// A database hiccup must not blank the page: the card still renders and the
		// sign-in POST reports its own failure clearly.
		console.error("[attendance] could not load the register", err);
	}

	const openAfternoon = Boolean(current.afternoon.entry && !current.afternoon.entry.signedOutAt);

	return (
		<DutyRegister
			user={user}
			initialShift={defaultShift(now, openAfternoon)}
			initialMonth={month}
			initialPeople={people}
			initialEntries={entries}
			initialCurrent={current}
		/>
	);
}
