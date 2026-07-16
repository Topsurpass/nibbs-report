// Shared numeric / date helpers for the NIBBS settlement auditor.
// All amounts are Naira with 2 decimal places. To sidestep floating-point
// drift on values in the tens of billions, equality checks round to whole
// cents (integers up to ~1.6e13, well within Number.MAX_SAFE_INTEGER).

/** Parse an HTML money cell such as "-157,598,787,534.90" or "0.00". */
export function parseMoney(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" ) return NaN;
  return parseFloat(cleaned);
}

/**
 * Parse an eTranzact amount field: a signed, zero-padded fixed-width value
 * such as "+00000003756557371.44" or "-00000063656071194.99".
 */
export function parseTxtAmount(raw: string): number {
  const cleaned = raw.trim();
  // parseFloat handles the leading +/- and zero padding directly.
  return parseFloat(cleaned);
}

/** Whole-cent representation of an amount, used for exact comparisons. */
export function toCents(n: number): number {
  return Math.round(n * 100);
}

/**
 * True when two amounts are equal to the cent. Excel's checks flag any
 * nonzero difference; rounding to cents reproduces that without float noise.
 */
export function centsEqual(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

const nairaFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an amount with thousands separators and 2 decimals, e.g. -157,598,787,534.90. */
export function formatNaira(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return nairaFormatter.format(n);
}

/** Format with a leading ₦ for headline figures. */
export function formatNairaSymbol(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `₦${nairaFormatter.format(n)}`;
}

/** Parse a "YYYY/MM/DD" string (eTranzact in-file date) into a Date, or null. */
export function parseSlashDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/** Parse a "ddmmyyyy" string (from the TXT filename) into a Date, or null. */
export function parseDdmmyyyy(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Number(y), month - 1, day);
}

/** Format a Date as "ddmmyyyy". */
export function toDdmmyyyy(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}${m}${y}`;
}

/** Format a Date as "YYYY/MM/DD" to match the eTranzact in-file date. */
export function toSlashDate(date: Date): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/** True when two Dates fall on the same calendar day. */
export function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Whole-day difference b - a (used for the file-age check, mirroring F - TODAY()). */
export function dayDiff(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS);
}
