import JSZip from "jszip";
import { groupFileStem, safeFileName, todayStamp } from "./names.ts";
import { buildBankWorkbook, buildSummaryWorkbook, toBuffer } from "./workbook.ts";
import type { BankGroup, SplitOptions } from "./types.ts";

/**
 * Bundles one `.xlsx` per beneficiary bank into a single archive, so the whole
 * escalation set downloads in one click instead of thirteen.
 *
 * Server-only: never import this from a client component — it would pull exceljs
 * and jszip into the browser bundle for no reason (the preview needs neither).
 */

type GridOptions = Pick<SplitOptions, "columns" | "includeBankName">;

export interface ZipInput {
	groups: BankGroup[];
	fileHeaders: string[];
	options: GridOptions;
	amountColumn: string | null;
	/** Included as `00-Summary.xlsx` when true. */
	includeSummary?: boolean;
}

export async function buildEscalationZip({
	groups,
	fileHeaders,
	options,
	amountColumn,
	includeSummary = true,
}: ZipInput): Promise<Buffer> {
	const zip = new JSZip();

	if (includeSummary) {
		zip.file("00-Summary.xlsx", await toBuffer(buildSummaryWorkbook(groups)));
	}

	// Shared across the archive so two banks can never claim the same entry —
	// a duplicate name would overwrite one bank's file inside the zip.
	const taken = new Set<string>(["00-summary"]);
	for (const group of groups) {
		const name = safeFileName(groupFileStem(group), taken);
		const wb = buildBankWorkbook(group, fileHeaders, options, amountColumn);
		zip.file(`${name}.xlsx`, await toBuffer(wb));
	}

	return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** `Fraud_Escalation_2026-08-13.zip` */
export function zipFileName(now: Date = new Date()): string {
	return `Fraud_Escalation_${todayStamp(now)}.zip`;
}

/** `Fraud_Escalation_ROLEZ_MICROFINANCE_BANK_(C39)_2026-08-13.xlsx` */
export function bankFileName(group: BankGroup, now: Date = new Date()): string {
	const stem = safeFileName(groupFileStem(group), new Set());
	return `Fraud_Escalation_${stem}_${todayStamp(now)}.xlsx`;
}

/** `Fraud_Escalation_All_Banks_2026-08-13.xlsx` */
export function combinedFileName(now: Date = new Date()): string {
	return `Fraud_Escalation_All_Banks_${todayStamp(now)}.xlsx`;
}
