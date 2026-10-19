import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMerge, defaultMergeDate, mergeChecks, mergedFileName, sortSources } from "./merge.ts";
import { inspectSourceFile } from "./sourceFile.ts";
import { MON, SAT, SUN, fullWeekend, sessionFile, sessionLines } from "./testFixtures.ts";

const MERGE_DATE = new Date(2026, 5, 8);

function shuffle<T>(xs: T[]): T[] {
  // Deterministic reversal + interleave so the test never depends on Math.random.
  const r = [...xs].reverse();
  return r.filter((_, i) => i % 2 === 0).concat(r.filter((_, i) => i % 2 === 1));
}

test("merge order is Sat 8am → Sat 5pm → Sun 8am → Sun 5pm whatever the upload order", () => {
  const merged = buildMerge(shuffle(fullWeekend()), MERGE_DATE, 1);
  assert.deepEqual(
    merged.sources.map((s) => s.name),
    [SAT, SUN].flatMap((d) => [1, 2, 3, 4].map((s) => `ETRANZACT_${d}_${s}.txt`)),
  );
});

test("rows are appended file after file with the date rewritten", () => {
  const merged = buildMerge(shuffle(fullWeekend()), MERGE_DATE, 1);
  assert.equal(merged.rows.length, 32);
  const expected = fullWeekend().flatMap((f) =>
    f.records.map((r) => `702\t2026/06/08\t${r.code}\t${r.amountStr}`),
  );
  assert.deepEqual(merged.rows.map((r) => r.line), expected);
  assert.equal(merged.rows[0].sourceName, `ETRANZACT_${SAT}_1.txt`);
  assert.equal(merged.rows[31].sourceName, `ETRANZACT_${SUN}_4.txt`);
});

test("code and amount bytes are copied exactly", () => {
  const text = sessionLines(SAT, 0).join("\r\n");
  const src = inspectSourceFile(`ETRANZACT_${SAT}_1.txt`, text);
  const merged = buildMerge([src], MERGE_DATE, 1);
  assert.equal(merged.text, text.replaceAll("2026/06/06", "2026/06/08"));
});

test("output uses CRLF and has no trailing newline", () => {
  const { text } = buildMerge(fullWeekend(), MERGE_DATE, 1);
  assert.equal(text.split("\r\n").length, 32);
  assert.equal(/[^\r]\n/.test(text), false);
  assert.equal(text.endsWith("\n"), false);
});

test("merged net is zero and all checks pass for a full weekend", () => {
  const merged = buildMerge(fullWeekend(), MERGE_DATE, 1);
  assert.equal(merged.sumKobo, BigInt(0));
  const checks = mergeChecks(merged, MERGE_DATE);
  assert.deepEqual(checks.filter((c) => c.status !== "pass"), []);
});

test("filename carries the merge date and chosen session", () => {
  assert.equal(mergedFileName(MERGE_DATE, 1), `ETRANZACT_${MON}_1.txt`);
  assert.equal(buildMerge(fullWeekend(), MERGE_DATE, 3).fileName, `ETRANZACT_${MON}_3.txt`);
});

test("default merge date is the next business day after the weekend", () => {
  const day = (d: Date) => d.toDateString();
  const holidays = (...keys: string[]) => (key: string) =>
    keys.includes(key) ? { date: key, name: "Holiday", tentative: false } : undefined;
  assert.equal(day(defaultMergeDate(fullWeekend())), day(MERGE_DATE));
  // Friday holiday + weekend → Monday.
  const fri = [1, 2, 3, 4].map((s) => sessionFile("05062026", s));
  assert.equal(day(defaultMergeDate([...fri, ...fullWeekend()])), day(MERGE_DATE));
  // A lone Friday holiday (no weekend file) counts from that Friday → Monday.
  assert.equal(day(defaultMergeDate(fri)), day(MERGE_DATE));
  // Weekend + Monday files, Monday a normal day → still Monday.
  const mon = [1, 2].map((s) => sessionFile(MON, s));
  assert.equal(day(defaultMergeDate([...fullWeekend(), ...mon])), day(MERGE_DATE));
  // Weekend + Monday holiday (uploaded or not) → Tuesday.
  const monHoliday = holidays("2026-06-08");
  assert.equal(day(defaultMergeDate([...fullWeekend(), ...mon], monHoliday)), day(new Date(2026, 5, 9)));
  assert.equal(day(defaultMergeDate(fullWeekend(), monHoliday)), day(new Date(2026, 5, 9)));
  // Christmas Fri 25 + Boxing Day Sat 26 Dec 2026, weekend, then Mon 28 → Mon 28.
  const xmas = [sessionFile("25122026", 1), sessionFile("26122026", 1), sessionFile("27122026", 1)];
  assert.equal(day(defaultMergeDate(xmas, holidays("2026-12-25", "2026-12-26"))), day(new Date(2026, 11, 28)));
  // New Year: Thu 31 Dec weekend-less, Fri 1 Jan 2027 holiday → Mon 4 Jan.
  assert.equal(day(defaultMergeDate([sessionFile("31122026", 1)], holidays("2027-01-01"))), day(new Date(2027, 0, 4)));
  // No dated file → today.
  assert.equal(day(defaultMergeDate([], undefined, new Date(2026, 9, 19, 15))), day(new Date(2026, 9, 19)));
});

test("invalid sources are never merged and sort last", () => {
  const bad = { ...sessionFile(SAT, 1), name: "zzz.txt", valid: false, date: null, session: undefined };
  const sorted = sortSources([bad, ...fullWeekend()]);
  assert.equal(sorted[sorted.length - 1].name, "zzz.txt");
  assert.equal(buildMerge([bad, ...fullWeekend()], MERGE_DATE, 1).rows.length, 32);
});

test("merge date not after the weekend is warned", () => {
  const merged = buildMerge(fullWeekend(), new Date(2026, 5, 7), 1);
  const check = mergeChecks(merged, new Date(2026, 5, 7)).find((c) => c.id === "merge-date");
  assert.equal(check?.status, "warn");
});

test("Sat + Sun + Mon merged into Monday passes; a holiday merge date warns", () => {
  const files = [...fullWeekend(), sessionFile(MON, 1), sessionFile(MON, 2)];
  const date = (c: ReturnType<typeof mergeChecks>) => c.find((x) => x.id === "merge-date")!;
  const merged = buildMerge(files, MERGE_DATE, 1);
  assert.equal(date(mergeChecks(merged, MERGE_DATE)).status, "pass");
  const monHoliday = (key: string) => (key === "2026-06-08" ? { date: key, name: "Test Day", tentative: false } : undefined);
  const c = date(mergeChecks(merged, MERGE_DATE, monHoliday));
  assert.equal(c.status, "warn");
  assert.equal(c.detail, "Merge date 2026/06/08 is a public holiday (Test Day).");
});
