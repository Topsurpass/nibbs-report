import { z } from "zod";
import { SESSION_LABELS } from "../session/nibbsSession.ts";

/** Contract for a daily schedule report document (create/update API + editor). */

/**
 * Request to push breached banks from the Settlement Auditor onto the day's daily
 * report (create-or-append). `session` maps to the NIBSS row detail (e.g. "11am").
 */
export const nibbsBreachAppendSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
	session: z.enum(SESSION_LABELS),
	breaches: z
		.array(z.object({ code: z.string().min(1), name: z.string().min(1) }))
		.min(1, "No breached banks to add"),
});


const summaryRowSchema = z.object({
	id: z.string().min(1),
	detail: z.string(),
	findings: z.string(),
	status: z.string(),
});

const summaryCategorySchema = z.object({
	id: z.string().min(1),
	task: z.string().min(1, "Category needs a TASK name"),
	description: z.string(),
	rows: z.array(summaryRowSchema),
});

const fraudAlertSchema = z.object({
	id: z.string().min(1),
	timeLogged: z.string(),
	caseRef: z.string(),
	description: z.string(),
	status: z.string(),
	escalatedTo: z.string(),
	remarks: z.string(),
});

const recommendationSchema = z.object({
	id: z.string().min(1),
	text: z.string(),
});

export const coverSchema = z.object({
	department: z.string().trim().min(1, "Department is required"),
	handoverType: z.enum(["Morning to Afternoon", "Afternoon to Night", "Night to Morning"]),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
	outgoingOfficers: z.array(z.string()).min(1, "Add at least one outgoing officer"),
	incomingOfficers: z.array(z.string()),
	timeOfHandover: z.string(),
});

export const scheduleReportSchema = z.object({
	cover: coverSchema,
	summary: z.array(summaryCategorySchema),
	fraudAlerts: z.array(fraudAlertSchema),
	recommendations: z.array(recommendationSchema),
});

export type ScheduleReportInput = z.infer<typeof scheduleReportSchema>;
