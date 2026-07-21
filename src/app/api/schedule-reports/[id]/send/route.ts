import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/services/auth/guards";
import { getReport } from "@/services/schedule/repository";
import { getUserById, listUsers } from "@/services/auth/users-repository";
import { buildScheduleXlsxBuffer } from "@/lib/schedule/excel";
import { coverDate, scheduleFileName } from "@/lib/schedule/exportSchedule";
import { normalizeReport } from "@/lib/schedule/template";
import { sendScheduleReport } from "@/services/email/mailer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const sendSchema = z.object({
	toUserId: z.string().min(1, "Pick a recipient"),
	ccUserIds: z.array(z.string()).optional(),
	ccAll: z.boolean().optional(),
	message: z.string().max(2000).optional(),
});

function escapeHtml(v: string): string {
	return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Email a saved report (styled .xlsx attached) to a user, optionally CC others. */
export async function POST(request: Request, ctx: Ctx) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	const { id } = await ctx.params;

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
	}
	const parsed = sendSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json({ ok: false, error: "Pick a recipient." }, { status: 400 });
	}

	try {
		const stored = await getReport(id);
		if (!stored) return Response.json({ ok: false, error: "Report not found." }, { status: 404 });

		const recipient = await getUserById(parsed.data.toUserId);
		if (!recipient) {
			return Response.json({ ok: false, error: "Recipient not found." }, { status: 404 });
		}

		// Resolve CC emails: everyone else, or the explicitly chosen users.
		let cc: string[] = [];
		if (parsed.data.ccAll || (parsed.data.ccUserIds && parsed.data.ccUserIds.length)) {
			const all = await listUsers();
			if (parsed.data.ccAll) {
				cc = all.filter((u) => u.id !== recipient.id).map((u) => u.email);
			} else {
				const chosen = new Set(parsed.data.ccUserIds);
				cc = all.filter((u) => chosen.has(u.id) && u.id !== recipient.id).map((u) => u.email);
			}
		}

		const report = normalizeReport(stored.data);
		const c = report.cover;
		const sender = `${auth.user.firstName} ${auth.user.lastName}`;
		const to = recipient.email;

		// Building the styled workbook and the SMTP round-trip are the slow parts;
		// run them AFTER the response so the click feels instant. Everything that
		// can fail visibly (bad recipient, missing report) was already checked.
		after(async () => {
			try {
				const buffer = await buildScheduleXlsxBuffer(report);
				const filename = scheduleFileName(report);
				const subject = `Daily Schedule Report — ${coverDate(c.date)} (${c.handoverType})`;
				const note = parsed.data.message?.trim();
				const textLines = [
					note || `Kindly find attached daily schedule report.`,
					"",
					`Date:      ${coverDate(c.date)}`,
					`Handover:  ${c.handoverType}`,
					`Outgoing:  ${c.outgoingOfficers.join(", ") || "—"}`,
					`Incoming:  ${c.incomingOfficers.join(", ") || "—"}`,
					"",
					`Sent by ${sender} via Auto Auditor.`,
				];
				const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
      ${note ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(note)}</p>` : ""}
      <h2 style="margin:0 0 8px;font-size:16px;">Daily Schedule Report</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Date</td><td>${escapeHtml(coverDate(c.date))}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Handover</td><td>${escapeHtml(c.handoverType)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Outgoing</td><td>${escapeHtml(c.outgoingOfficers.join(", ") || "—")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Incoming</td><td>${escapeHtml(c.incomingOfficers.join(", ") || "—")}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">The full report is attached as ${escapeHtml(filename)}.<br/>Sent by ${escapeHtml(sender)} via Auto Auditor.</p>
    </body></html>`;

				const sent = await sendScheduleReport({
					to,
					cc,
					subject,
					text: textLines.filter((l) => l !== "").join("\n"),
					html,
					filename,
					buffer,
				});
				if (!sent.ok) {
					console.warn(`[schedule] report ${id} email not delivered`, sent.error ?? "(skipped)");
				}
			} catch (err) {
				console.error(`[schedule] report ${id} email failed`, err);
			}
		});

		return Response.json({ ok: true, to, ccCount: cc.length });
	} catch (err) {
		console.error("[schedule] send failed", err);
		return Response.json({ ok: false, error: "Couldn't send the report." }, { status: 503 });
	}
}
