import { Agent } from "node:https";
import webpush, { WebPushError } from "web-push";
import { readPushConfig } from "@/lib/push/config";
import type { PushPayload } from "@/lib/push/schedule";
import { deleteDevice, markDeviceOk, type PushDevice } from "./repository";

/**
 * Sends Web Push messages with VAPID, via `web-push`. Never throws: a push
 * that can't go out must not break the sign-in or the cron that triggered it.
 * Devices the push service reports gone (404/410) are deleted.
 */

export interface SendResult {
	delivered: number;
	failed: number;
	pruned: number;
	errors: string[];
}

let configured: boolean | undefined;

/** True when VAPID keys are set; logs once when they are not. */
export function pushConfigured(): boolean {
	if (configured !== undefined) return configured;
	const config = readPushConfig(process.env);
	if (!config.enabled || !config.publicKey || !config.privateKey) {
		console.warn(`[push] push notifications disabled: missing ${config.missing.join(", ")}.`);
		configured = false;
		return configured;
	}
	webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
	configured = true;
	return configured;
}

// Test hook for `npm run eval:push`: its mock push service on localhost uses a
// self-signed certificate. Never applies in production or to a real endpoint.
const insecureLocal =
	process.env.NODE_ENV !== "production" && process.env.PUSH_ALLOW_LOCAL_TEST_ENDPOINTS === "1"
		? new Agent({ rejectUnauthorized: false })
		: null;

function agentFor(endpoint: string): Agent | undefined {
	if (!insecureLocal) return undefined;
	const host = new URL(endpoint).hostname;
	return host === "localhost" || host === "127.0.0.1" ? insecureLocal : undefined;
}

export async function sendToDevices(devices: PushDevice[], payload: PushPayload, ttlSeconds: number): Promise<SendResult> {
	const result: SendResult = { delivered: 0, failed: 0, pruned: 0, errors: [] };
	if (devices.length === 0 || !pushConfigured()) return result;
	const body = JSON.stringify(payload);

	await Promise.all(
		devices.map(async (d) => {
			try {
				await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, body, {
					TTL: ttlSeconds,
					urgency: "high",
					timeout: 10_000,
					agent: agentFor(d.endpoint),
				});
				result.delivered++;
				await markDeviceOk(d.id).catch(() => undefined);
			} catch (err) {
				const status = err instanceof WebPushError ? err.statusCode : undefined;
				if (status === 404 || status === 410) {
					result.pruned++;
					await deleteDevice(d.id).catch(() => undefined);
				} else {
					result.failed++;
					result.errors.push(status ? `HTTP ${status}` : err instanceof Error ? err.message : String(err));
				}
			}
		}),
	);
	return result;
}
