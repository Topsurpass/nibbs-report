import { teamAlertPayload } from "@/lib/push/schedule";
import type { DutyDate, Shift } from "@/lib/attendance/shifts";
import { devicesFor, finishLog, logSend } from "./repository";
import { sendToDevices } from "./sender";

/** A team alert is stale after an hour: nobody needs "Ada signed in" the next morning. */
const TEAM_ALERT_TTL_SECONDS = 60 * 60;

export interface TeamEvent {
	actor: { id: string; firstName: string; lastName: string };
	action: "sign-in" | "sign-out";
	shift: Shift;
	date: DutyDate;
	at: Date;
}

/** Tell every other subscribed member that someone signed in or out. */
export async function notifyTeam(event: TeamEvent) {
	const devices = await devicesFor({ allExcept: event.actor.id });
	const logId = await logSend(event.actor.id, `team-${event.action}`);
	const payload = teamAlertPayload({
		name: `${event.actor.firstName} ${event.actor.lastName}`.trim(),
		action: event.action,
		shift: event.shift,
		date: event.date,
		at: event.at,
		userId: event.actor.id,
	});
	const sent = await sendToDevices(devices, payload, TEAM_ALERT_TTL_SECONDS);
	await finishLog(logId, {
		status: devices.length === 0 ? "no-device" : sent.delivered > 0 ? "sent" : "failed",
		devices: sent.delivered,
		error: sent.errors.slice(0, 3).join("; ") || undefined,
	});
	console.info(`[push] team ${event.action} by ${event.actor.id}: ${sent.delivered}/${devices.length} delivered, ${sent.pruned} pruned`);
	return sent;
}
