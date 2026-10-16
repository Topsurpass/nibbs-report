// Synthetic session files in the exact eTranzact layout (no customer data).
// Each file is balanced so it nets to zero, like every real NIBBS file.

import { inspectSourceFile, type SourceFile } from "./sourceFile.ts";

const CODES = ["4000470158", "4000460155", "4010160155", "4000015103"];

/** Amount field for a whole-kobo value: sign + 17 digits + "." + 2 decimals. */
export function amountField(kobo: number): string {
  const sign = kobo < 0 ? "-" : "+";
  const abs = Math.abs(kobo);
  return `${sign}${String(Math.floor(abs / 100)).padStart(17, "0")}.${String(abs % 100).padStart(2, "0")}`;
}

/** "ddmmyyyy" → "yyyy/mm/dd". */
export function slash(ddmmyyyy: string): string {
  return `${ddmmyyyy.slice(4)}/${ddmmyyyy.slice(2, 4)}/${ddmmyyyy.slice(0, 2)}`;
}

/** Lines for one balanced file. `seed` makes amounts unique per file. */
export function sessionLines(ddmmyyyy: string, seed: number): string[] {
  const a = 100_000 + seed * 1_111;
  const b = 250_050 + seed * 707;
  const c = 9_999 + seed;
  const amounts = [a, -b, c, b - a - c];
  return CODES.map((code, i) => ["702", slash(ddmmyyyy), code, amountField(amounts[i])].join("\t"));
}

export function sessionText(ddmmyyyy: string, seed: number): string {
  return sessionLines(ddmmyyyy, seed).join("\r\n");
}

export function sessionFile(ddmmyyyy: string, session: number, seed = session): SourceFile {
  const name = `ETRANZACT_${ddmmyyyy}_${session}.txt`;
  return inspectSourceFile(name, sessionText(ddmmyyyy, seed + Number(ddmmyyyy.slice(0, 2)) * 10), name);
}

export const SAT = "06062026"; // Saturday 6 June 2026
export const SUN = "07062026"; // Sunday 7 June 2026
export const MON = "08062026"; // Monday 8 June 2026

/** A full weekend: Sat 1-4 then Sun 1-4. */
export function fullWeekend(): SourceFile[] {
  return [SAT, SUN].flatMap((d) => [1, 2, 3, 4].map((s) => sessionFile(d, s)));
}
