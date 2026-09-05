import type { ImageModel } from "@/lib/attendance/exportAttendance";

/**
 * Renders the month summary to a JPEG, for pasting into a chat or a mail.
 *
 * Hand-drawn on a canvas rather than pulling in a DOM-screenshot library: the
 * content model is already computed, the layout is a table, and a dependency
 * that rasterises live DOM would also drag in the page's theme, fonts and
 * scroll state. This always produces the same image whatever the viewer's theme.
 *
 * Deliberately light-only: a JPEG has no transparency, and a dark card pasted
 * into a light chat thread reads as a mistake.
 */

const SCALE = 2; // Retina-sharp without being enormous.
const WIDTH = 940;
const PAD = 36;
const TITLE_H = 92;
const HEADER_H = 42;
const ROW_H = 36;
const FOOTER_H = 46;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const ZEBRA = "#f8fafc";
const ACCENT = "#4f46e5";
const TOTAL_BG = "#eef2ff";

const FONT = (weight: number, size: number) =>
	`${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Trim to fit a column, with an ellipsis, so long names never overlap. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let cut = text;
	while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
		cut = cut.slice(0, -1);
	}
	return `${cut}…`;
}

interface Column {
	x: number;
	width: number;
	align: "left" | "right";
	label: string;
}

function layout(model: ImageModel): Column[] {
	const usable = WIDTH - PAD * 2;
	const totalWeight = model.columns.reduce((n, c) => n + c.weight, 0);
	let x = PAD;
	return model.columns.map((col) => {
		const width = (usable * col.weight) / totalWeight;
		const column: Column = { x, width, align: col.align, label: col.label };
		x += width;
		return column;
	});
}

function drawCell(
	ctx: CanvasRenderingContext2D,
	column: Column,
	text: string,
	y: number,
	gutter = 12,
) {
	const inner = column.width - gutter * 2;
	const clipped = fit(ctx, text, inner);
	if (column.align === "right") {
		ctx.textAlign = "right";
		ctx.fillText(clipped, column.x + column.width - gutter, y);
	} else {
		ctx.textAlign = "left";
		ctx.fillText(clipped, column.x + gutter, y);
	}
}

/** Draws the summary and returns the canvas. */
export function paintSummary(model: ImageModel): HTMLCanvasElement {
	// An empty month still gets one body row, so the note has somewhere to sit
	// and the totals band never collides with the header.
	const bodyRows = model.rows.length || (model.emptyNote ? 1 : 0);
	const height = TITLE_H + HEADER_H + bodyRows * ROW_H + ROW_H + FOOTER_H;

	const canvas = document.createElement("canvas");
	canvas.width = WIDTH * SCALE;
	canvas.height = height * SCALE;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("This browser can't render the image.");
	ctx.scale(SCALE, SCALE);

	// Ground. JPEG has no alpha, so an unpainted canvas would come out black.
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, WIDTH, height);

	// Accent rule along the top, so the image reads as a document.
	ctx.fillStyle = ACCENT;
	ctx.fillRect(0, 0, WIDTH, 6);

	ctx.textBaseline = "middle";
	ctx.fillStyle = INK;
	ctx.font = FONT(700, 26);
	ctx.textAlign = "left";
	ctx.fillText(fit(ctx, model.title, WIDTH - PAD * 2), PAD, 44);

	ctx.fillStyle = MUTED;
	ctx.font = FONT(400, 15);
	ctx.fillText(fit(ctx, model.subtitle, WIDTH - PAD * 2), PAD, 72);

	const columns = layout(model);
	let y = TITLE_H;

	// Header band.
	ctx.fillStyle = ACCENT;
	ctx.fillRect(PAD, y, WIDTH - PAD * 2, HEADER_H);
	ctx.fillStyle = "#ffffff";
	ctx.font = FONT(600, 14);
	for (const column of columns) drawCell(ctx, column, column.label, y + HEADER_H / 2);
	y += HEADER_H;

	// Body.
	ctx.font = FONT(400, 15);
	model.rows.forEach((row, i) => {
		if (i % 2 === 1) {
			ctx.fillStyle = ZEBRA;
			ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H);
		}
		ctx.fillStyle = INK;
		row.forEach((value, c) => drawCell(ctx, columns[c], value, y + ROW_H / 2));

		ctx.strokeStyle = LINE;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(PAD, y + ROW_H + 0.5);
		ctx.lineTo(WIDTH - PAD, y + ROW_H + 0.5);
		ctx.stroke();
		y += ROW_H;
	});

	if (model.rows.length === 0 && model.emptyNote) {
		ctx.fillStyle = MUTED;
		ctx.textAlign = "left";
		ctx.fillText(fit(ctx, model.emptyNote, WIDTH - PAD * 2 - 24), PAD + 12, y + ROW_H / 2);
		y += ROW_H;
	}

	// Totals.
	ctx.fillStyle = TOTAL_BG;
	ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H);
	ctx.fillStyle = INK;
	ctx.font = FONT(700, 15);
	model.totals.forEach((value, c) => drawCell(ctx, columns[c], value, y + ROW_H / 2));
	y += ROW_H;

	ctx.fillStyle = MUTED;
	ctx.font = FONT(400, 12);
	ctx.textAlign = "left";
	ctx.fillText(fit(ctx, model.footer, WIDTH - PAD * 2), PAD, y + FOOTER_H / 2);

	return canvas;
}

/** Paint, encode and save. Rejects rather than saving a blank file. */
export async function downloadSummaryJpeg(model: ImageModel): Promise<void> {
	const canvas = paintSummary(model);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.92),
	);
	if (!blob) throw new Error("This browser couldn't encode the image.");

	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = model.fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoke on the next frame; revoking synchronously can cancel the download.
	requestAnimationFrame(() => URL.revokeObjectURL(url));
}
