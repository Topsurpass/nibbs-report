import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWithSettlement, type MismatchKind } from "./compare.ts";
import { buildMerge } from "./merge.ts";
import { fullWeekend } from "./testFixtures.ts";

const merged = buildMerge(fullWeekend(), new Date(2026, 5, 8), 1);
const ours = { name: merged.fileName, text: merged.text };
const lines = merged.text.split("\r\n");

function theirs(mutate: (l: string[]) => string[] | string, name = ours.name) {
  const out = mutate([...lines]);
  return compareWithSettlement(ours, { name, text: Array.isArray(out) ? out.join("\r\n") : out });
}
const check = (r: ReturnType<typeof compareWithSettlement>, id: string) => r.checks.find((c) => c.id === id)?.status;
const kindsAt = (r: ReturnType<typeof compareWithSettlement>, row: number): MismatchKind[] => r.rows[row - 1].kinds;

test("an identical file passes every check", () => {
  const r = compareWithSettlement(ours, { ...ours });
  assert.equal(r.pass, true);
  assert.equal(r.mismatched, 0);
  assert.equal(r.matched, 32);
  assert.deepEqual(r.checks.filter((c) => c.status !== "pass"), []);
});

test("a space instead of a tab is a spacing mismatch", () => {
  const r = theirs((l) => ((l[4] = l[4].replace("\t", " ")), l));
  assert.equal(r.pass, false);
  assert.deepEqual(kindsAt(r, 5), ["whitespace"]);
  assert.equal(r.rows[4].reasons[0], "Spacing: space used where a single tab is required");
  assert.equal(r.mismatched, 1);
});

test("trailing spaces on a row are a spacing mismatch", () => {
  const r = theirs((l) => ((l[0] = l[0] + "  "), l));
  assert.deepEqual(kindsAt(r, 1), ["whitespace"]);
  assert.equal(r.rows[0].reasons[0], "Spacing: trailing space/tab after the amount");
});

test("a wrong date is a date mismatch", () => {
  const r = theirs((l) => ((l[7] = l[7].replace("2026/06/08", "2026/06/06")), l));
  assert.deepEqual(kindsAt(r, 8), ["date"]);
  assert.match(r.rows[7].reasons[0], /Date: expected "2026\/06\/08", got "2026\/06\/06"/);
});

test("a wrong amount is an amount mismatch and breaks net zero", () => {
  const r = theirs((l) => ((l[2] = l[2].replace(/\d\.(\d\d)$/, (_m, d) => `9.${d}`)), l));
  assert.deepEqual(kindsAt(r, 3), ["amount"]);
  assert.equal(check(r, "cmp-sum-zero"), "fail");
});

test("a wrong bank code is a code mismatch", () => {
  const r = theirs((l) => ((l[10] = l[10].replace(/\t\d{10}\t/, "\t4999999999\t")), l));
  assert.deepEqual(kindsAt(r, 11), ["code"]);
  assert.match(r.rows[10].reasons[0], /got "4999999999"/);
});

test("swapped rows are reported as order, pointing at the right row", () => {
  const r = theirs((l) => (([l[3], l[9]] = [l[9], l[3]]), l));
  assert.deepEqual(kindsAt(r, 4), ["order"]);
  assert.deepEqual(kindsAt(r, 10), ["order"]);
  assert.match(r.rows[3].reasons[0], /belongs at row 10/);
  assert.equal(check(r, "cmp-sum-zero"), "pass");
});

test("missing and extra rows are flagged and counts differ", () => {
  const missing = theirs((l) => l.slice(0, -1));
  assert.deepEqual(kindsAt(missing, 32), ["missing"]);
  assert.equal(check(missing, "cmp-row-count"), "fail");
  const extra = theirs((l) => [...l, l[0]]);
  assert.deepEqual(kindsAt(extra, 33), ["extra"]);
});

test("LF and CRLF are equivalent: an all-LF or mixed file still matches", () => {
  for (const r of [
    theirs((l) => l.join("\n")),
    theirs((l) => l.slice(0, 5).join("\r\n") + "\n" + l.slice(5).join("\r\n")),
  ]) {
    assert.equal(r.pass, true);
    assert.equal(r.mismatched, 0);
    assert.equal(r.checks.some((c) => c.id === "cmp-line-endings"), false);
  }
});

test("regression: Settlement joins session files with a bare LF; that still matches", () => {
  // Real pattern (ETRANZACT_01082026_1.txt): each session file has CRLF inside
  // and no final newline, so the joins between files end in LF only.
  const sessions = [lines.slice(0, 4), lines.slice(4, 8), lines.slice(8)].map((s) => s.join("\r\n"));
  const r = compareWithSettlement(ours, { name: ours.name, text: sessions.join("\n") });
  assert.equal(r.pass, true, JSON.stringify(r.checks.filter((c) => c.status !== "pass")));
  assert.equal(r.mismatched, 0);
  assert.equal(r.matched, 32);
});

test("a real difference on a join row is still caught", () => {
  const sessions = [lines.slice(0, 4), lines.slice(4)].map((s) => s.join("\r\n"));
  const joined = sessions.join("\n").replace(lines[3], lines[3].replace(/\d\.(\d\d)$/, (_m, d) => `7.${d}`));
  const r = compareWithSettlement(ours, { name: ours.name, text: joined });
  assert.equal(r.pass, false);
  assert.deepEqual(kindsAt(r, 4), ["amount"]);
});

test("a trailing newline is warned, not a row mismatch", () => {
  const r = theirs((l) => l.join("\r\n") + "\r\n");
  assert.equal(check(r, "cmp-trailing-newline"), "warn");
  assert.equal(r.mismatched, 0);
  assert.equal(r.pass, true);
});

test("a different filename fails and names the differing part", () => {
  const r = theirs((l) => l, "ETRANZACT_09062026_2.txt");
  const c = r.checks.find((x) => x.id === "cmp-filename");
  assert.equal(c?.status, "fail");
  assert.match(c!.detail, /date 09062026 ≠ 08062026, session _2 ≠ _1/);
});

test("diffSegments marks only the fields and separators that differ", async () => {
  const { diffSegments } = await import("./compare.ts");
  const segs = diffSegments("702\t2026/06/08\t4000470158\t+1.00", "702 2026/06/08\t4000470159\t+1.00");
  assert.deepEqual(
    segs.filter((s) => s.changed).map((s) => s.text),
    [" ", "4000470159"],
  );
  assert.ok(diffSegments(null, "702").every((s) => s.changed));
});

test("spacingReason names each separator problem", async () => {
  const { spacingReason } = await import("./compare.ts");
  assert.equal(spacingReason("702\t\t2026/06/08\tx\ty"), "Spacing: double tab between fields");
  assert.equal(spacingReason(" 702\t2026/06/08\tx\ty"), "Spacing: leading space/tab before the record");
});
