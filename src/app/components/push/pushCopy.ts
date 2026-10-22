import type { PushState } from "../providers/PushProvider";

/** What to tell people about each push state, shared by the bell and the banner. */
export const PUSH_HELP: Record<Exclude<PushState, "loading" | "off" | "on">, string> = {
	unsupported: "This browser can't receive notifications. Use Chrome, Edge, Firefox or Safari.",
	"needs-install":
		"On iPhone or iPad, tap Share → Add to Home Screen, then open Audit Toolkit from your Home Screen and turn notifications on there.",
	unavailable: "Notifications aren't set up on the server yet. Ask an admin.",
	blocked:
		"Notifications are blocked for this site. Click the lock icon in the address bar, allow Notifications, then reload.",
};

export const PUSH_PITCH = "Get a reminder when your shift starts and ends, and an alert when someone on the team signs in or out.";
