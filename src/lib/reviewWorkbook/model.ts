// Sheet model for the plain-words "review" workbooks sent to the Settlement
// team (Weekend Settlement and Settlement Audit). Content decides what each
// cell says; `paint.ts` decides how it looks.

export type CellTone = "bad" | "good" | "warn" | "muted";

export interface ReportCell {
	value: string | number;
	tone?: CellTone;
	bold?: boolean;
	/** Fixed-width font, for file content. */
	mono?: boolean;
}

export type RowStyle = "plain" | "problem" | "ok" | "group";

export interface ReportRow {
	cells: ReportCell[];
	style: RowStyle;
}

/** A label spanning columns `from`..`to` (0-based) above the header: which side is whose. */
export interface ReportBand {
	label: string;
	from: number;
	to: number;
	side: "ours" | "theirs";
}

export interface ReportTable {
	/** Bold heading above the table, if any. */
	title?: string;
	/** Labels above the header, e.g. "Our compilation" over our columns. */
	bands?: ReportBand[];
	header: string[];
	/** 0-based columns left blank as a gutter between our side and theirs. */
	gaps?: number[];
	rows: ReportRow[];
}

export interface ReportSheet {
	name: string;
	/** Title, then one-line notes. */
	preamble: string[];
	/** Tone of the second preamble line (the verdict). */
	verdictTone?: CellTone;
	widths: number[];
	tables: ReportTable[];
}

export interface DiscrepancyReport {
	fileName: string;
	sheets: ReportSheet[];
}
