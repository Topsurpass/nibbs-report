import { candidateDates, dueReminders, SEND_WINDOW_MINUTES } from "@/lib/push/schedule";
import { listEntriesOn } from "@/services/attendance/repository";
import { claimKey, claimedKeys, devicesFor, dismissalsOn, finishLog, subscriberIds } from "./repository";
import { sendToDevices } from "./sender";

export interface ReminderRun {
	due: number;
	sent: number;
	failed: number;
	noDevice: number;
	pruned: number;
}

/**
 * Send every reminder due at `now`. Safe to call as often as you like: each
 * reminder's key is claimed in the push log before sending, so overlapping or
 * repeated runs send it once.
 */
export async function runDueReminders(now: Date, onlyUsers?: string[]): Promise<ReminderRun> {
	const run: ReminderRun = { due: 0, sent: 0, failed: 0, noDevice: 0, pruned: 0 };
	const all = await subscriberIds();
	// `onlyUsers` scopes a test run to its own throwaway users.
	const subscribers = onlyUsers ? all.filter((id) => onlyUsers.includes(id)) : all;
	if (subscribers.length === 0) return run;

	const dates = candidateDates(now);
	const [entries, notOnDuty] = await Promise.all([listEntriesOn(dates), dismissalsOn(dates)]);
	const candidates = dueReminders({ now, subscribers, entries, sent: new Set(), notOnDuty });
	const already = await claimedKeys(candidates.map((c) => c.key));
	const due = candidates.filter((c) => !already.has(c.key));
	run.due = due.length;

	for (const r of due) {
		const logId = await claimKey(r.userId, r.kind, r.key);
		if (!logId) continue; // another run got there first
		const devices = await devicesFor({ userIds: [r.userId] });
		const result = await sendToDevices(devices, r.payload, SEND_WINDOW_MINUTES * 60);
		run.pruned += result.pruned;
		if (devices.length === 0) run.noDevice++;
		else if (result.delivered > 0) run.sent++;
		else run.failed++;
		await finishLog(logId, {
			status: devices.length === 0 ? "no-device" : result.delivered > 0 ? "sent" : "failed",
			devices: result.delivered,
			error: result.errors.slice(0, 3).join("; ") || undefined,
		});
	}
	if (run.due > 0) console.info(`[push] reminders at ${now.toISOString()}: ${JSON.stringify(run)}`);
	return run;
}
