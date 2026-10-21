import { downloadReview } from "@/lib/reviewWorkbook/download";
import { buildDiscrepancyReport, type BankNameLookup } from "@/lib/weekendMerge/discrepancyReport";
import type { ComparisonResult, MergeResult } from "@/lib/weekendMerge";

/** Build the "What to fix" workbook for the Settlement team in the browser and save it. */
export async function downloadDiscrepancyReport(
	merge: MergeResult,
	comparison: ComparisonResult,
	settlementName: string,
	bankName?: BankNameLookup,
): Promise<void> {
	const generatedAt = new Date();
	await downloadReview(buildDiscrepancyReport({ merge, comparison, settlementName, generatedAt, bankName }), generatedAt);
}
