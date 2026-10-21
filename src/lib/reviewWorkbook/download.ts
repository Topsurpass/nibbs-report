import { downloadBytes } from "../downloadText.ts";
import type { DiscrepancyReport } from "./model.ts";
import { buildReviewXlsx } from "./paint.ts";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Paint a review workbook in the browser and save it. exceljs is imported on
 * demand: it is only needed when someone clicks.
 */
export async function downloadReview(report: DiscrepancyReport, generatedAt: Date): Promise<void> {
	const mod = await import("exceljs");
	const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
	const bytes = await buildReviewXlsx(report, ExcelJS, generatedAt);
	downloadBytes(report.fileName, bytes, XLSX_TYPE);
}
