import { z } from "zod";
import { isNightDate } from "@/lib/attendance/nightWindow";
import { SHIFTS } from "@/lib/attendance/shifts";
import { isPushServiceEndpoint } from "@/lib/push/endpoints";

/** The eval's mock push service runs on localhost; never allowed in production. */
const allowLocal = process.env.NODE_ENV !== "production" && process.env.PUSH_ALLOW_LOCAL_TEST_ENDPOINTS === "1";

/** A browser PushSubscription, as `subscription.toJSON()` serialises it. */
export const subscriptionSchema = z.object({
	endpoint: z
		.string()
		.url()
		.refine((e) => isPushServiceEndpoint(e, { allowLocal }), "Not a browser push service endpoint."),
	keys: z.object({
		p256dh: z.string().min(16).max(256),
		auth: z.string().min(8).max(64),
	}),
});

export const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export const notOnDutySchema = z.object({
	shift: z.enum(SHIFTS as ["night", "afternoon"]),
	date: z.string().refine(isNightDate, "Not a shift date."),
});
