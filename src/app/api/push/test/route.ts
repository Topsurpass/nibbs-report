import { requireUser } from "@/services/auth/guards";
import { devicesFor, finishLog, logSend } from "@/services/push/repository";
import { sendToDevices } from "@/services/push/sender";

export const runtime = "nodejs";

/** Send "Notifications are on" to every device of the signed-in user. */
export async function POST() {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;
	try {
		const devices = await devicesFor({ userIds: [auth.user.id] });
		const logId = await logSend(auth.user.id, "test");
		const result = await sendToDevices(
			devices,
			{
				title: "Notifications are on",
				body: "You'll get sign-in and sign-out reminders, and alerts when the team signs in or out.",
				url: "/attendance",
				tag: "test",
			},
			300,
		);
		await finishLog(logId, {
			status: devices.length === 0 ? "no-device" : result.delivered > 0 ? "sent" : "failed",
			devices: result.delivered,
			error: result.errors.join("; ") || undefined,
		});
		if (result.delivered === 0) {
			return Response.json(
				{ ok: false, error: devices.length === 0 ? "This account has no devices with notifications on." : "The push service didn't accept it. Turn notifications off and on again." },
				{ status: 409 },
			);
		}
		return Response.json({ ok: true, delivered: result.delivered });
	} catch (err) {
		console.error("[push] test failed", err);
		return Response.json({ ok: false, error: "Couldn't send a test notification." }, { status: 503 });
	}
}
