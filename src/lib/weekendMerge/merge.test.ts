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

test("default merge date is the next business day after the last file", () => {
  assert.equal(defaultMergeDate(fullWeekend()).toDateString(), MERGE_DATE.toDateString());
  // Friday holiday + weekend → Monday.
  const fri = [1, 2, 3, 4].map((s) => sessionFile("05062026", s));
  assert.equal(defaultMergeDate(fri).toDateString(), MERGE_DATE.toDateString());
  // Weekend + Monday holiday → Tuesday.
  const monHol = [1, 2, 3, 4].map((s) => sessionFile(MON, s));
  assert.equal(defaultMergeDate([...fullWeekend(), ...monHol]).toDateString(), new Date(2026, 5, 9).toDateString());
});

test("invalid sources are never merged and sort last", () => {
  const bad = { ...sessionFile(SAT, 1), name: "zzz.txt", valid: false, date: null, session: undefined };
  const sorted = sortSources([bad, ...fullWeekend()]);
  assert.equal(sorted[sorted.length - 1].name, "zzz.txt");
  assert.equal(buildMerge([bad, ...fullWeekend()], MERGE_DATE, 1).rows.length, 32);
});

test("merge date not after the last file is warned", () => {
  const merged = buildMerge(fullWeekend(), new Date(2026, 5, 7), 1);
  const check = mergeChecks(merged, new Date(2026, 5, 7)).find((c) => c.id === "merge-date");
  assert.equal(check?.status, "warn");
});
