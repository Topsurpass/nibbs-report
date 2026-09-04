import { z } from "zod";
import { isNightDate, parseClock } from "@/lib/attendance/nightWindow";

/**
 * Payload for an admin adding or correcting a night.
 *
 * Times arrive as Lagos wall-clock `HH:MM` rather than instants: an admin types
 * "signed in at 21:00", and letting the browser build a timestamp would drag its
 * own timezone into a register that is defined in Lagos time.
 */

const clock = z.string().refine((v) => parseClock(v) !== null, "Use a 24-hour time like 21:00.");

export const adminEntrySchema = z.object({
	userId: z.string().uuid("Pick an analyst."),
	nightDate: z.string().refine(isNightDate, "Pick a real date."),
	signedIn: clock,
	/** Empty means the night stays open — hours unknown rather than assumed. */
	signedOut: z.union([clock, z.literal("")]).optional(),
	note: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
});

export type AdminEntryInput = z.infer<typeof adminEntrySchema>;

export const deleteEntrySchema = z.object({
	userId: z.string().uuid("Pick an analyst."),
	nightDate: z.string().refine(isNightDate, "Pick a real date."),
});
