import { redirect } from "next/navigation";
import NightDutyRegister from "@/app/components/attendance/NightDutyRegister";
import { currentMonth, nightDateFor } from "@/lib/attendance/nightWindow";
import type { AttendanceEntry } from "@/lib/attendance/types";
import { getSessionUser } from "@/services/auth/sessions";
import { getEntry } from "@/services/attendance/repository";
import { loadRegister } from "@/services/attendance/service";

export const dynamic = "force-dynamic";

/**
 * Night-duty register.
 *
 * Renders the current month and tonight's row server-side so the sign-in card
 * is correct on first paint rather than after a round trip. The night is
 * computed from the server clock — a device with a wrong clock must not be able
 * to open the window early.
 */
export default async function AttendancePage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	const now = new Date();
	const month = currentMonth(now);
	const nightDate = nightDateFor(now);

	let people = [{ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email }];
	let entries: AttendanceEntry[] = [];
	let tonight: AttendanceEntry | null = null;

	try {
		const [register, entry] = await Promise.all([
			loadRegister(user, month, "me"),
			nightDate ? getEntry(user.id, nightDate) : Promise.resolve(null),
		]);
		people = register.people;
		entries = register.entries;
		tonight = entry;
	} catch (err) {
		// A database hiccup must not blank the page: the card still renders and the
		// sign-in POST reports its own failure clearly.
		console.error("[attendance] could not load the register", err);
	}

	return (
		<NightDutyRegister
			user={user}
			initialMonth={month}
			initialPeople={people}
			initialEntries={entries}
			initialNightDate={nightDate}
			initialEntry={tonight}
		/>
	);
}
