import { requireSql } from "@/services/db/client";
import { withRetry } from "@/services/db/retry";
import { DEFAULT_MASTER, type MasterBank } from "@/lib/master";

/**
 * Persistence for the master bank list + collateral (table `nibbs_banks`).
 *
 * `collateral` is a Postgres `bigint`; the HTTP driver returns it as a string,
 * so reads coerce back to a JS number (all values are whole Naira well under
 * Number.MAX_SAFE_INTEGER). Writes go through a single `.transaction()` so add,
 * edit, and delete all land atomically on Save.
 */

interface BankRow {
	code: string;
	name: string;
	collateral: string | number;
}

function toBank(row: BankRow): MasterBank {
	return {
		code: row.code,
		name: row.name,
		collateral: Number(row.collateral) || 0,
	};
}

/** Normalize an incoming row: trimmed strings, integer collateral. */
function clean(bank: MasterBank): MasterBank {
	return {
		code: bank.code.trim(),
		name: bank.name.trim(),
		collateral: Math.trunc(Number(bank.collateral) || 0),
	};
}

export async function listBanks(): Promise<MasterBank[]> {
	const sql = requireSql();
	const rows = (await withRetry(
		() => sql`select code, name, collateral from nibbs_banks order by name asc`,
	)) as BankRow[];
	return rows.map(toBank);
}

/**
 * Replace the stored master with `list`: upsert every incoming bank by code and
 * delete any stored code not present. Rows missing a code or name are dropped.
 * Runs in one transaction, then returns the freshly stored list.
 */
export async function syncBanks(list: MasterBank[]): Promise<MasterBank[]> {
	const sql = requireSql();

	// De-dupe by code (last write wins) and drop incomplete rows.
	const byCode = new Map<string, MasterBank>();
	for (const raw of list) {
		const b = clean(raw);
		if (!b.code || !b.name) continue;
		byCode.set(b.code, b);
	}
	const banks = [...byCode.values()];
	const codes = banks.map((b) => b.code);

	const statements = [
		// Remove anything no longer in the list (deletes all when codes is empty).
		sql`delete from nibbs_banks where not (code = any(${codes}))`,
		...banks.map(
			(b) => sql`
				insert into nibbs_banks (code, name, collateral, updated_at)
				values (${b.code}, ${b.name}, ${b.collateral}, now())
				on conflict (code) do update
				set name = excluded.name,
				    collateral = excluded.collateral,
				    updated_at = now()
			`,
		),
	];

	await withRetry(() => sql.transaction(statements));
	return listBanks();
}

/** Replace all banks with the built-in defaults ("Reset to defaults"). */
export async function resetBanks(): Promise<MasterBank[]> {
	return syncBanks(DEFAULT_MASTER);
}
