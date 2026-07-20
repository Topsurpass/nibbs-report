/**
 * Retry helper for Neon DB calls.
 *
 * Neon is reached over HTTP `fetch`. On WSL2/local dev the first (cold)
 * connection is slow and the host's IPv6 record can stall, so a single query
 * occasionally fails with `fetch failed` / `ETIMEDOUT`. Retrying with backoff
 * lets these transient blips self-heal and hardens against Neon cold-starts.
 */

interface RetryOptions {
	/** Total attempts including the first. */
	attempts?: number;
	/** Base backoff in ms; doubles each retry, capped at `maxDelayMs`. */
	baseDelayMs?: number;
	maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const { attempts = 5, baseDelayMs = 300, maxDelayMs = 2400 } = options;

	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			if (attempt === attempts) break;
			const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
			console.warn(
				`[db] call failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms:`,
				err instanceof Error ? err.message : err,
			);
			await sleep(delay);
		}
	}
	throw lastError;
}
