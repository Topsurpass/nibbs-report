/**
 * Is push set up on the server, and if not, which settings are missing.
 *
 * The public key is read at request time and sent to the browser by
 * `/api/push/status`, rather than baked into the page at build time, so adding
 * or changing it only needs a redeploy, never a cache-free rebuild. Either
 * `VAPID_PUBLIC_KEY` or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is accepted.
 * Setting names are not secrets; showing them tells an admin what to fix.
 */

export interface PushConfig {
	enabled: boolean;
	publicKey: string | null;
	privateKey: string | null;
	subject: string;
	/** Names of the settings that still need adding. */
	missing: string[];
}

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => {
	const t = v?.trim().replace(/^["']|["']$/g, "");
	return t ? t : null;
};

export function readPushConfig(env: Env): PushConfig {
	const publicKey = clean(env.VAPID_PUBLIC_KEY) ?? clean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
	const privateKey = clean(env.VAPID_PRIVATE_KEY);
	const missing: string[] = [];
	if (!publicKey) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
	if (!privateKey) missing.push("VAPID_PRIVATE_KEY");
	return {
		enabled: missing.length === 0,
		publicKey,
		privateKey,
		subject: clean(env.VAPID_SUBJECT) ?? "mailto:admin@example.com",
		missing,
	};
}
