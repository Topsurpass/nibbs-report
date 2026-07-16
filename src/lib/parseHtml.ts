// Parser for the settlement-team HTML export ("Data from Frame" source).
// The file is a UTF-16-LE HTML document containing a single <TABLE>. Each bank
// row has a "<TD COLSPAN=5>" bank cell holding "<Name> - <10-digit code>",
// followed by OUTGOING SUM, INCOMING SUM and NET SETTLEMENT POSITION cells.

import { parseMoney } from "./format";

export interface FrameRow {
  /** Raw bank cell text, e.g. "Access Bank plc - 4000470158". */
  bankString: string;
  /** Bank name portion (before the trailing " - <code>"). */
  name: string;
  /** 10-digit code parsed from the bank cell, or "" if absent. */
  code: string;
  outgoing: number;
  incoming: number;
  /** NET SETTLEMENT POSITION — the Frame amount (column O). */
  netPosition: number;
}

export interface FrameParseResult {
  rows: FrameRow[];
  /** Sum of netPosition across kept rows (must be 0 — Check 1). */
  netSum: number;
  /** Count of blank rows dropped. */
  droppedEmpty: number;
  /** Count of "PocketMoni - Access -" rows dropped. */
  droppedPocketMoni: number;
  /** Batch metadata pulled from the header rows, when present. */
  batchId?: string;
  settlementPeriod?: string;
}

const POCKETMONI_MARKER = "PocketMoni - Access -";

/** Decode the file bytes as UTF-16-LE (the export's encoding) with a UTF-8 fallback. */
export function decodeSettlementHtml(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // BOM 0xFF 0xFE => UTF-16 LE. The export uses UTF-16 LE regardless of BOM.
  const looksUtf16 =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    // heuristic: lots of NUL bytes in the ASCII range positions
    (bytes.length > 4 && bytes[1] === 0x00 && bytes[3] === 0x00);
  const encoding = looksUtf16 ? "utf-16le" : "utf-8";
  return new TextDecoder(encoding).decode(buffer);
}

/** Extract text content from a cell, collapsing whitespace and <BR>. */
function cellText(cell: Element): string {
  return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Split "Access Bank plc - 4000470158" into name + 10-digit code.
 * The code is the last " - "-delimited segment when it is all digits.
 */
function splitBank(bankString: string): { name: string; code: string } {
  const parts = bankString.split(" - ");
  const last = parts[parts.length - 1]?.trim() ?? "";
  if (/^\d{6,}$/.test(last)) {
    return { name: parts.slice(0, -1).join(" - ").trim(), code: last };
  }
  return { name: bankString.trim(), code: "" };
}

export function parseSettlementHtml(html: string): FrameParseResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) {
    return {
      rows: [],
      netSum: 0,
      droppedEmpty: 0,
      droppedPocketMoni: 0,
    };
  }

  const rows: FrameRow[] = [];
  let droppedEmpty = 0;
  let droppedPocketMoni = 0;
  let batchId: string | undefined;
  let settlementPeriod: string | undefined;

  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const cells = Array.from(tr.querySelectorAll("td, th"));
    const texts = cells.map(cellText);
    const nonEmpty = texts.filter((t) => t.length > 0);

    // Capture header metadata.
    const joined = texts.join(" ");
    if (joined.includes("Settlement Batch Id:")) {
      const idx = texts.findIndex((t) => t === "Settlement Batch Id:");
      const val = texts.slice(idx + 1).find((t) => t.length > 0);
      if (val) batchId = val;
    }
    if (joined.includes("Settlement Period:")) {
      const idx = texts.findIndex((t) => t === "Settlement Period:");
      const val = texts.slice(idx + 1).find((t) => t.length > 0 && /To/i.test(t));
      if (val) settlementPeriod = val;
    }

    // A data row's first cell is the bank cell (COLSPAN=5). Identify by having a
    // bank string that contains " - " plus at least one numeric amount cell.
    const bankCellIdx = texts.findIndex((t) => t.includes(" - "));
    if (bankCellIdx === -1) {
      // Fully blank data-shaped rows are silently ignored (not counted unless
      // they are the wide bank-cell blanks handled below).
      if (cells.length > 0 && nonEmpty.length === 0) {
        // could be a spacer row; count only wide (colspan) blanks as dropped-empty
        const hasWideCell = cells.some(
          (c) => Number(c.getAttribute("colspan")) >= 5,
        );
        if (hasWideCell) droppedEmpty++;
      }
      continue;
    }

    const bankString = texts[bankCellIdx];

    // Skip PocketMoni - Access - rows (no valid code, escrow pass-through).
    if (bankString.startsWith(POCKETMONI_MARKER)) {
      droppedPocketMoni++;
      continue;
    }

    const { name, code } = splitBank(bankString);
    if (!code) {
      // A bank-shaped row without a numeric code — treat as noise.
      continue;
    }

    // Remaining non-empty texts after the bank cell are the three amounts.
    const amountTexts = texts
      .slice(bankCellIdx + 1)
      .filter((t) => /[0-9]/.test(t));
    if (amountTexts.length < 3) continue;

    const outgoing = parseMoney(amountTexts[0]);
    const incoming = parseMoney(amountTexts[1]);
    const netPosition = parseMoney(amountTexts[2]);
    if (!Number.isFinite(netPosition)) continue;

    rows.push({ bankString, name, code, outgoing, incoming, netPosition });
  }

  const netSum = rows.reduce((s, r) => s + r.netPosition, 0);

  return {
    rows,
    netSum,
    droppedEmpty,
    droppedPocketMoni,
    batchId,
    settlementPeriod,
  };
}
