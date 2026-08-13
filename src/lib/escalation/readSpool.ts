import * as XLSX from "xlsx";
import type { Row } from "./types.ts";

/**
 * Reads a spooled transaction workbook into headers + string rows.
 *
 * Runs in both places on purpose: the browser calls it to build the live
 * preview, and the download route calls it again on the re-posted file. Same
 * function, same options, so what the analyst sees is what the banks get.
 *
 * `raw: false` keeps every cell as the formatted string Excel displays, which
 * preserves codes like "011" that would otherwise arrive as the number 11.
 */

export interface Spool {
	headers: string[];
	rows: Row[];
	/** Name of the sheet that was read. */
	sheetName: string;
	/** Every sheet in the workbook, so the UI can offer a picker. */
	sheetNames: string[];
}

export class SpoolReadError extends Error {}

/**
 * Pick the sheet to split. Defaults to the first sheet with more than a header
 * row — `fraud_escalation.xls` leads with `Sheet0`, but an empty first sheet
 * shouldn't produce an empty result.
 */
function pickSheet(wb: XLSX.WorkBook, requested?: string): string {
	if (requested && wb.SheetNames.includes(requested)) return requested;
	for (const name of wb.SheetNames) {
		const ref = wb.Sheets[name]?.["!ref"];
		if (!ref) continue;
		const range = XLSX.utils.decode_range(ref);
		if (range.e.r > range.s.r) return name;
	}
	return wb.SheetNames[0];
}

export function readSpool(data: ArrayBuffer | Uint8Array, sheet?: string): Spool {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	let wb: XLSX.WorkBook;
	try {
		wb = XLSX.read(bytes, { type: "array" });
	} catch (err) {
		throw new SpoolReadError(
			`Could not read that file. Use a .xlsx, .xls or .csv export. (${
				err instanceof Error ? err.message : String(err)
			})`,
		);
	}

	if (wb.SheetNames.length === 0) throw new SpoolReadError("That workbook has no sheets.");

	const sheetName = pickSheet(wb, sheet);
	const ws = wb.Sheets[sheetName];
	if (!ws) throw new SpoolReadError(`Sheet "${sheetName}" is not in that workbook.`);

	// Read as a grid first so the header row is recovered exactly as written,
	// including duplicate or blank headers that sheet_to_json would rename.
	const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
		header: 1,
		blankrows: false,
		raw: false,
		defval: "",
	});
	if (grid.length === 0) throw new SpoolReadError("That sheet is empty.");

	const headers = dedupeHeaders(
		(grid[0] ?? []).map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`),
	);

	const rows: Row[] = [];
	for (let r = 1; r < grid.length; r++) {
		const line = grid[r] ?? [];
		if (line.every((c) => String(c ?? "").trim() === "")) continue;
		const row: Row = {};
		headers.forEach((h, c) => {
			row[h] = String(line[c] ?? "").trim();
		});
		rows.push(row);
	}

	// SheetJS does not reject unknown bytes — it falls back to reading them as
	// delimited text, so a PDF or an image parses into a single junk header with
	// no rows. Treating "no data rows" as a read failure turns that into a clear
	// message instead of a confusing empty preview.
	if (rows.length === 0) {
		throw new SpoolReadError(
			`No transaction rows found in "${sheetName}". Check the file is a spooled transaction export.`,
		);
	}

	return { headers, rows, sheetName, sheetNames: [...wb.SheetNames] };
}

/** Two columns with the same header would collide in a Row map; suffix them. */
function dedupeHeaders(headers: string[]): string[] {
	const seen = new Map<string, number>();
	return headers.map((h) => {
		const n = seen.get(h) ?? 0;
		seen.set(h, n + 1);
		return n === 0 ? h : `${h} (${n + 1})`;
	});
}
