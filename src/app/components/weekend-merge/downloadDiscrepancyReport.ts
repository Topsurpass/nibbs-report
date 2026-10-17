import { downloadBytes } from "@/lib/downloadText";
import { buildDiscrepancyReport } from "@/lib/weekendMerge/discrepancyReport";
import { buildDiscrepancyXlsx } from "@/lib/weekendMerge/discrepancyExcel";
import type { ComparisonResult, MergeResult } from "@/lib/weekendMerge";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Build the side-by-side discrepancy workbook in the browser and save it.
 * exceljs is imported on demand: it is only needed when someone clicks.
 */
export async function downloadDiscrepancyReport(
	merge: MergeResult,
	comparison: ComparisonResult,
	settlementName: string,
): Promise<void> {
	const mod = await import("exceljs");
	const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
	const generatedAt = new Date();
	const report = buildDiscrepancyReport({ merge, comparison, settlementName, generatedAt });
	const bytes = await buildDiscrepancyXlsx(report, ExcelJS, generatedAt);
	downloadBytes(report.fileName, bytes, XLSX_TYPE);
}
