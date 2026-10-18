import { requireUser } from "@/services/auth/guards";
import { getNigerianHolidays } from "@/services/holidays/googleCalendar";

export const runtime = "nodejs";

/**
 * Nigerian public holidays (from Google Calendar), for labelling weekday
 * settlement files. Only the public holiday list crosses the network;
 * settlement files never leave the browser.
 */
export async function GET() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const feed = await getNigerianHolidays();
	if (!feed) {
		return Response.json({ ok: false, error: "Holiday calendar is unavailable right now." }, { status: 503 });
	}
	return Response.json({ ok: true, source: "google", ...feed });
}
