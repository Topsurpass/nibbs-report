/**
 * Settlement codes NIBBS still reports separately in the Frame HTML export
 * long after the owning bank merged into another one — mapped here to the
 * bank's current/primary settlement code.
 *
 * eTranzact/Smartdet already reports the combined bank under its current
 * code only. The Frame HTML, by contrast, can still carry a line item under
 * the old code (typically marked with a non-digit prefix like "###" — see
 * `splitBank` in parseHtml.ts). Without this map, `reconcile()`'s per-code
 * Jive check (Smartdet amount vs Frame amount) would flag the primary
 * code's row as permanently off by the legacy code's amount on any report
 * where the legacy code has activity — arithmetically correct, economically
 * wrong, since both sides agree on the combined total.
 *
 * `reconcile()` folds a legacy code's Frame amount into its primary code's
 * for the Jive check only (collateral is unaffected — it's keyed off the
 * Smartdet amount directly, which is already correct). The legacy code's
 * own row still appears in the reconciliation table with its own real
 * figures; it just doesn't get checked against Smartdet on its own. The
 * merge is never silent — reconcile.ts surfaces it in Check 6's detail text
 * and on both rows' `mergeNote` whenever it actually applies to a report.
 */
export const LEGACY_BANK_CODE_MERGES: Record<string, string> = {
	// Diamond Bank merged into Access Bank in 2019. NIBBS was still carrying
	// Diamond's old settlement code as a separate Frame line item as of the
	// 2026-09-30 settlement file that surfaced this.
	"4000630109": "4000470158", // Access Bank Plc (Diamond) -> Access Bank Plc
};
