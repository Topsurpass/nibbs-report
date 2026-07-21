import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email delivery via Gmail SMTP (App Password auth).
 *
 * Used to hand a newly-created analyst their generated one-time password. Self
 * contained: credentials live only in the environment (GMAIL_USER /
 * GMAIL_APP_PASSWORD). When they're absent (CI, tests, a dev box without mail)
 * the senders no-op with `{ ok: false, skipped: true }` and never throw — the
 * caller decides whether that's acceptable.
 */

export interface SendResult {
	ok: boolean;
	skipped?: boolean;
	error?: string;
}

export interface CredentialRecipient {
	firstName: string;
	email: string;
}

function getCredentials() {
	const user = process.env.GMAIL_USER?.trim();
	const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
	return { user, pass };
}

function makeTransport(user: string, pass: string): Transporter {
	return nodemailer.createTransport({
		service: "gmail",
		auth: { user, pass },
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Send a created analyst their login email + one-time password. */
export async function sendCredentialsEmail(
	recipient: CredentialRecipient,
	password: string,
	loginUrl: string,
): Promise<SendResult> {
	return send(
		recipient.email,
		"Auto Auditor account",
		renderCredentialText(
			recipient.firstName,
			recipient.email,
			password,
			loginUrl,
			false,
		),
		renderCredentialHtml(
			recipient.firstName,
			recipient.email,
			password,
			loginUrl,
			false,
		),
	);
}

/** Send an analyst a reset one-time password (admin-triggered). */
export async function sendPasswordResetEmail(
	recipient: CredentialRecipient,
	password: string,
	loginUrl: string,
): Promise<SendResult> {
	return send(
		recipient.email,
		"Your Auto Auditor password was reset",
		renderCredentialText(
			recipient.firstName,
			recipient.email,
			password,
			loginUrl,
			true,
		),
		renderCredentialHtml(
			recipient.firstName,
			recipient.email,
			password,
			loginUrl,
			true,
		),
	);
}

/** Send a self-service password-reset link (forgot-password flow). */
export async function sendPasswordResetLinkEmail(
	recipient: CredentialRecipient,
	resetUrl: string,
): Promise<SendResult> {
	const name = firstName(recipient.firstName);
	const text = [
		`Hi ${name},`,
		"",
		"We received a request to reset your Auto Auditor password. Open the link below to choose a new one. It expires in 1 hour and can be used once.",
		"",
		`Reset your password: ${resetUrl}`,
		"",
		"If you didn't request this, you can ignore this email — your password won't change.",
		"",
		"— Auto Auditor",
	].join("\n");

	const html = `<!doctype html>
  <html>
    <body style="margin:0;background:#f4f6fb;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#0d9488,#4f46e5);padding:18px 24px;">
            <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:-0.01em;">Auto Auditor</span>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 12px;color:#111827;font-size:16px;font-weight:700;">Reset your password</p>
            <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
              Hi ${escapeHtml(name)}, we got a request to reset your password. Click below to choose a new one.
              This link expires in <strong>1 hour</strong> and works once.
            </p>
            <div style="margin:0 0 18px;">
              <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 28px;border-radius:9999px;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Reset password</a>
            </div>
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
              Didn't request this? You can safely ignore this email — your password won't change.
            </p>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

	return send(
		recipient.email,
		"Reset your Auto Auditor password",
		text,
		html,
	);
}

async function send(
	to: string,
	subject: string,
	text: string,
	html: string,
): Promise<SendResult> {
	const { user, pass } = getCredentials();
	if (!user || !pass) {
		console.warn(
			"[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — credential email skipped.",
		);
		return { ok: false, skipped: true };
	}
	try {
		await makeTransport(user, pass).sendMail({
			from: `"Auto Auditor" <${user}>`,
			to,
			subject,
			text,
			html,
		});
		return { ok: true };
	} catch (err) {
		console.error("[email] failed to send credential email", err);
		return {
			ok: false,
			error: err instanceof Error ? err.message : "send failed",
		};
	}
}

export interface ScheduleEmailInput {
	to: string;
	cc?: string[];
	subject: string;
	text: string;
	html: string;
	filename: string;
	buffer: Buffer;
}

/**
 * Send a daily schedule report to a recipient (optionally CC'ing others), with
 * the styled `.xlsx` attached. Same skip-when-unconfigured posture as the other
 * senders — never throws to the caller.
 */
export async function sendScheduleReport(
	input: ScheduleEmailInput,
): Promise<SendResult> {
	const { user, pass } = getCredentials();
	if (!user || !pass) {
		console.warn(
			"[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — schedule report not emailed.",
		);
		return { ok: false, skipped: true };
	}
	try {
		await makeTransport(user, pass).sendMail({
			from: `"Auto Auditor" <${user}>`,
			to: input.to,
			cc: input.cc && input.cc.length ? input.cc : undefined,
			subject: input.subject,
			text: input.text,
			html: input.html,
			attachments: [{ filename: input.filename, content: input.buffer }],
		});
		return { ok: true };
	} catch (err) {
		console.error("[email] failed to send schedule report", err);
		return {
			ok: false,
			error: err instanceof Error ? err.message : "send failed",
		};
	}
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] || "there";
}

function renderCredentialText(
	name: string,
	email: string,
	password: string,
	loginUrl: string,
	isReset: boolean,
): string {
	return [
		`Hi ${firstName(name)},`,
		"",
		isReset
			? "An admin reset your Auto Auditor password. Use the temporary password below to sign in, then set a new one."
			: "An admin created your Auto Auditor account. Use the temporary password below to sign in, then set your own password.",
		"",
		`Sign in:   ${loginUrl}`,
		`Email:     ${email}`,
		`Password:  ${password}`,
		"",
		"You'll be asked to choose a new password immediately after signing in.",
		"",
		"— Auto Auditor",
	].join("\n");
}

function renderCredentialHtml(
	name: string,
	email: string,
	password: string,
	loginUrl: string,
	isReset: boolean,
): string {
	const row = (label: string, value: string) =>
		`<tr>
      <td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${label}</td>
      <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(value)}</td>
    </tr>`;

	return `<!doctype html>
  <html>
    <body style="margin:0;background:#f4f6fb;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#0d9488,#4f46e5);padding:18px 24px;">
            <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:-0.01em;">Auto Auditor</span>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 12px;color:#111827;font-size:16px;font-weight:700;">Hi ${escapeHtml(firstName(name))} 👋</p>
            <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
              ${
					isReset
						? "An admin reset your password. Use the temporary password below to sign in, then set a new one."
						: "An admin created your account. Use the temporary password below to sign in, then set your own password."
				}
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:8px 14px;">
              ${row("Email", email)}
              ${row("Temporary password", password)}
            </table>
            <div style="margin-top:22px;">
              <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:12px 28px;border-radius:9999px;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Sign in</a>
            </div>
            <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
              For your security you'll be asked to choose a new password right after signing in.
            </p>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}
