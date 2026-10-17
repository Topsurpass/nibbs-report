import { currentMonth } from "@/lib/attendance/nightWindow";
import { buildAttendanceXlsxBuffer } from "@/lib/attendance/excel";
import { parseShift } from "@/lib/attendance/shifts";
import { requireUser } from "@/services/auth/guards";
import { loadRegister, parseMonth, parseScope } from "@/services/attendance/service";

export const runtime = "nodejs";

/**
 * The month's register for one shift (`?shift=`) as a styled `.xlsx`.
 *
 * Reads through the same `loadRegister` the screen uses, so the download can
 * never show a scope the viewer is not allowed to see — and never disagrees with
 * the table it was downloaded from.
 */
export async function GET(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const url = new URL(request.url);
	const month = parseMonth(url.searchParams.get("month"), currentMonth(new Date()));
	const scope = parseScope(url.searchParams.get("scope"), auth.user.role === "admin");
	const shift = parseShift(url.searchParams.get("shift"));

	try {
		const register = await loadRegister(auth.user, month, scope);
		const { buffer, fileName } = await buildAttendanceXlsxBuffer({
			month,
			scope,
			shift,
			people: register.people,
			entries: register.entries.filter((e) => e.shift === shift),
			generatedAt: new Date(),
		});

		return new Response(new Uint8Array(buffer), {
			status: 200,
			headers: {
				"Content-Type":
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": `attachment; filename="${fileName}"`,
			},
		});
	} catch (err) {
		console.error("[attendance] export failed", err);
		return Response.json({ ok: false, error: "Couldn't build the file." }, { status: 503 });
	}
}
