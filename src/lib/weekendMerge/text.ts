// Low-level text helpers shared by the weekend-merge modules. Everything here
// works on the exact bytes of the file: line endings and whitespace are data,
// not noise, because NIBBS rejects files that deviate from the template.

export type LineEnding = "\r\n" | "\n" | "";

export interface SplitLine {
  /** Line content without its terminator. */
  content: string;
  /** The terminator that followed this line ("" for the last line of a file with no final newline). */
  ending: LineEnding;
}

export interface SplitText {
  lines: SplitLine[];
  /** True when the file ends with a line terminator. */
  trailingNewline: boolean;
  /** "crlf"/"lf" when every terminator agrees, "mixed" otherwise, "none" for a single unterminated line. */
  lineEndings: "crlf" | "lf" | "mixed" | "none";
}

/** Split text into lines, remembering each line's exact terminator. */
export function splitLinesExact(text: string): SplitText {
  const lines: SplitLine[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\n") continue;
    const crlf = i > start && text[i - 1] === "\r";
    lines.push({ content: text.slice(start, crlf ? i - 1 : i), ending: crlf ? "\r\n" : "\n" });
    start = i + 1;
  }
  const trailingNewline = text.length > 0 && start === text.length;
  if (!trailingNewline && text.length > 0) lines.push({ content: text.slice(start), ending: "" });

  const endings = new Set(lines.map((l) => l.ending).filter((e) => e !== ""));
  const lineEndings =
    endings.size === 0 ? "none" : endings.size > 1 ? "mixed" : endings.has("\r\n") ? "crlf" : "lf";
  return { lines, trailingNewline, lineEndings };
}

/** Make whitespace visible: tab → ⇥, space → ·, stray CR → ␍. */
export function visibleWhitespace(s: string): string {
  return s.replace(/\t/g, "⇥").replace(/ /g, "·").replace(/\r/g, "␍");
}

/**
 * Exact integer kobo (cents) for an eTranzact amount such as "+00000001489944920.60".
 * BigInt keeps sums exact however many sessions are merged. Returns null when the
 * string is not a well-formed amount.
 */
export function amountToKobo(raw: string): bigint | null {
  const m = raw.match(/^([+-])(\d+)\.(\d{2})$/);
  if (!m) return null;
  const [, sign, whole, frac] = m;
  const kobo = BigInt(whole + frac);
  return sign === "-" ? -kobo : kobo;
}

// BigInt constants (the project targets ES2017, so no `0n` literals).
export const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/** Kobo → Naira number for display only (never for equality checks). */
export function koboToNaira(kobo: bigint): number {
  return Number(kobo) / 100;
}

/** Format kobo as signed Naira with separators, e.g. -1,234.56. Exact (no float). */
export function formatKobo(kobo: bigint): string {
  const neg = kobo < ZERO;
  const abs = neg ? -kobo : kobo;
  const whole = (abs / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % HUNDRED).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
