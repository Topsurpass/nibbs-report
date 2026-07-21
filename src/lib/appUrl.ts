/**
 * Base URL for links in outbound emails (sign-in, password reset).
 *
 * Prefers the `APP_URL` env var so emails generated from a local/dev instance
 * still point at the deployed app instead of `localhost`. Falls back to the
 * request's own origin, then to the production URL.
 */

const DEFAULT_APP_URL = "https://nibbs-report.vercel.app";

export function getAppBaseUrl(request?: Request): string {
	const configured = process.env.APP_URL?.trim();
	if (configured) return configured.replace(/\/+$/, "");
	if (request) {
		try {
			return new URL(request.url).origin;
		} catch {
			// fall through
		}
	}
	return DEFAULT_APP_URL;
}
