import { requireUser } from "@/services/auth/guards";
import { detectColumns } from "@/lib/escalation/detectColumns";
import { groupByBank, verifyRowAccounting } from "@/lib/escalation/groupByBank";
import { mergeDirectory } from "@/lib/escalation/nipDirectory";
import { readSpool, SpoolReadError } from "@/lib/escalation/readSpool";
import { buildBankWorkbook, buildCombinedWorkbook, toBuffer } from "@/lib/escalation/workbook";
import {
	bankFileName,
	buildEscalationZip,
	combinedFileName,
	zipFileName,
} from "@/lib/escalation/zip";
import type { CodeMode } from "@/lib/escalation/types";
import { listNipOverrides } from "@/services/escalation/nip-overrides-repository";

export const runtime = "nodejs";

/** Refuse absurd uploads before reading them into memory. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface SplitRequest {
	columns?: string[];
	includeBankName?: boolean;
	successfulOnly?: boolean;
	codeColumn?: string;
	codeMode?: CodeMode;
	sheet?: string;
	/** "zip" (default) | "combined" | a single group's 3-char code. */
	target?: string;
}

function badRequest(error: string) {
	return Response.json({ ok: false, error }, { status: 400 });
}

function download(body: Buffer, type: string, filename: string) {
	return new Response(new Uint8Array(body), {
		status: 200,
		headers: {
			"Content-Type": type,
			// Quotes are stripped from the stem upstream, so this cannot break out
			// of the header value.
			"Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
			"Cache-Control": "no-store",
		},
	});
}

/**
 * Splits an uploaded spool into per-bank escalation files.
 *
 * The browser re-posts the original file rather than the parsed rows: the spool
 * is small, and re-reading it here with the same `readSpool` + `groupByBank`
 * the preview used means the download cannot drift from what was on screen.
 */
export async function POST(request: Request) {
	const auth = await requireUser();
	if ("response" in auth) return auth.response;

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return badRequest("Invalid upload.");
	}

	const file = form.get("file");
	if (!(file instanceof File)) return badRequest("Attach the spooled transactions file.");
	if (file.size === 0) return badRequest("That file is empty.");
	if (file.size > MAX_UPLOAD_BYTES) {
		return badRequest("That file is larger than 25MB. Split it and try again.");
	}

	let options: SplitRequest;
	try {
		options = JSON.parse(String(form.get("options") ?? "{}")) as SplitRequest;
	} catch {
		return badRequest("Invalid options.");
	}

	try {
		// Throws SpoolReadError for unreadable bytes or a sheet with no data rows.
		const spool = readSpool(await file.arrayBuffer(), options.sheet);
		const directory = mergeDirectory(await listNipOverrides());
		const columns = detectColumns(spool.rows, spool.headers, directory);

		const codeColumn = options.codeColumn ?? columns.code?.column;
		if (!codeColumn) {
			return badRequest(
				"No bank-code column was found in that file. Pick one before downloading.",
			);
		}
		if (!spool.headers.includes(codeColumn)) {
			return badRequest(`"${codeColumn}" is not a column in that file.`);
		}

		const result = groupByBank({
			rows: spool.rows,
			columns,
			directory,
			codeColumn,
			codeMode: options.codeMode ?? columns.code?.mode,
			successfulOnly: options.successfulOnly ?? false,
		});

		// The invariant the whole feature rests on: a transaction that vanishes
		// here is a transaction no bank is told to freeze.
		if (!verifyRowAccounting(result)) {
			console.error("[escalations] row accounting failed", {
				inputRows: result.inputRows,
				grouped: result.groups.reduce((n, g) => n + g.rows.length, 0),
				noCode: result.noCode.length,
				filteredOut: result.filteredOut,
			});
			return Response.json(
				{ ok: false, error: "Row accounting failed — refusing to build a partial escalation." },
				{ status: 500 },
			);
		}

		if (result.groups.length === 0) {
			return badRequest("No rows carried a usable bank code, so there is nothing to split.");
		}

		const grid = {
			columns: Array.isArray(options.columns) ? options.columns : [],
			includeBankName: options.includeBankName ?? true,
		};
		const target = options.target ?? "zip";

		if (target === "zip") {
			const zip = await buildEscalationZip({
				groups: result.groups,
				fileHeaders: spool.headers,
				options: grid,
				amountColumn: columns.amount,
			});
			return download(zip, "application/zip", zipFileName());
		}

		if (target === "combined") {
			const wb = buildCombinedWorkbook(
				result.groups,
				spool.headers,
				grid,
				columns.amount,
			);
			return download(await toBuffer(wb), XLSX_TYPE, combinedFileName());
		}

		const group = result.groups.find((g) => g.code === target.toUpperCase());
		if (!group) return badRequest(`No transactions for bank code "${target}".`);
		const wb = buildBankWorkbook(group, spool.headers, grid, columns.amount);
		return download(await toBuffer(wb), XLSX_TYPE, bankFileName(group));
	} catch (err) {
		if (err instanceof SpoolReadError) return badRequest(err.message);
		console.error("[escalations] split failed", err);
		return Response.json(
			{ ok: false, error: "Couldn't build the escalation files." },
			{ status: 503 },
		);
	}
}
