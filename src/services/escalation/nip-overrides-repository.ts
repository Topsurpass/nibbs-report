import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import { isCodeShaped, normalizeCode, type NipOverride } from "@/lib/escalation/nipDirectory";

/**
 * Persistence for operator-supplied NIP institution codes (`nibbs_nip_bank_codes`).
 *
 * Only the deltas live here: codes the bundled `bank_codes.xlsx` snapshot does
 * not carry (C62 / NOMBA FS) plus any correction to a bundled name. The full
 * directory is `mergeDirectory(listNipOverrides())`.
 */

interface OverrideRow {
	code: string;
	name: string;
}

export async function listNipOverrides(): Promise<NipOverride[]> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select code, name from nibbs_nip_bank_codes order by code asc`,
	)) as OverrideRow[];
	return rows.map((r) => ({ code: r.code, name: r.name }));
}

export class InvalidNipOverrideError extends Error {}

/**
 * Add or correct one mapping. Codes are stored upper-cased so lookups are
 * case-insensitive without a functional index.
 */
export async function upsertNipOverride(
	input: NipOverride,
	userId: string | null,
): Promise<NipOverride> {
	const code = normalizeCode(input.code);
	const name = String(input.name ?? "").trim();

	if (!isCodeShaped(code)) {
		throw new InvalidNipOverrideError("A bank code is exactly 3 letters or digits.");
	}
	if (!name) {
		throw new InvalidNipOverrideError("Enter the bank's name.");
	}
	if (name.length > 120) {
		throw new InvalidNipOverrideError("That bank name is too long (120 characters max).");
	}

	const sql = requireSql();
	await withRetry(
		() => sql`
			insert into nibbs_nip_bank_codes (code, name, created_by, updated_at)
			values (${code}, ${name}, ${userId}, now())
			on conflict (code) do update
			set name = excluded.name,
			    updated_at = now()
		`,
	);
	return { code, name };
}

/** Drop a mapping, falling back to the bundled snapshot for that code. */
export async function deleteNipOverride(rawCode: string): Promise<void> {
	const code = normalizeCode(rawCode);
	if (!isCodeShaped(code)) return;
	const sql = requireSql();
	await withRetry(() => sql`delete from nibbs_nip_bank_codes where code = ${code}`);
}
