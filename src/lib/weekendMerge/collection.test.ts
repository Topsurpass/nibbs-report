import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCollection, canMerge } from "./collection.ts";
import { inspectSourceFile } from "./sourceFile.ts";
import { MON, SAT, fullWeekend, sessionFile, sessionText } from "./testFixtures.ts";

const status = (files: ReturnType<typeof fullWeekend>, id: string) =>
  assessCollection(files).find((c) => c.id === id)?.status;

test("a complete weekend passes every collection check", () => {
  const checks = assessCollection(fullWeekend());
  assert.deepEqual(checks.filter((c) => c.status !== "pass"), []);
  assert.equal(canMerge(checks), true);
});

test("no files means nothing to merge", () => {
  assert.equal(canMerge(assessCollection([])), false);
});

test("a duplicate session blocks the merge", () => {
  const files = [...fullWeekend(), sessionFile(SAT, 2, 99)];
  assert.equal(status(files, "duplicates"), "fail");
  assert.equal(canMerge(assessCollection(files)), false);
});

test("a missing session blocks the merge and names it", () => {
  const files = fullWeekend().filter((f) => f.name !== `ETRANZACT_${SAT}_3.txt`);
  const check = assessCollection(files).find((c) => c.id === "sessions-complete");
  assert.equal(check?.status, "fail");
  assert.match(check!.detail, /Sat 2026\/06\/06: _3 \(2pm\)/);
});

test("an invalid file blocks the merge", () => {
  const bad = inspectSourceFile(`ETRANZACT_${SAT}_1 (1).txt`, sessionText(SAT, 1));
  assert.equal(canMerge(assessCollection([...fullWeekend(), bad])), false);
});

test("a gap between days only warns; weekdays are never flagged", () => {
  const fri = [1, 2, 3, 4].map((s) => sessionFile("05062026", s));
  const tue = [1, 2, 3, 4].map((s) => sessionFile("09062026", s));
  const files = [...fri, ...fullWeekend(), ...tue]; // Fri, Sat, Sun, (Mon missing), Tue
  assert.equal(status(files, "contiguous"), "warn");
  assert.equal(assessCollection(files).find((c) => c.id === "non-business-days"), undefined);
  assert.equal(canMerge(assessCollection(files)), true);
});

test("only Saturday and Sunday need all 4 sessions: a 2-file Monday passes", () => {
  const files = [...fullWeekend(), sessionFile(MON, 1), sessionFile(MON, 2)];
  const checks = assessCollection(files);
  assert.deepEqual(checks.filter((c) => c.status !== "pass"), []);
  assert.match(checks.find((c) => c.id === "sessions-complete")!.detail, /Other days as uploaded \(Mon 2026\/06\/08: 2 sessions\)/);
  assert.equal(canMerge(checks), true);
  // A lone holiday with one session is fine too.
  assert.equal(canMerge(assessCollection([sessionFile("12062026", 1)])), true);
  // But a duplicate on a weekday still blocks.
  assert.equal(canMerge(assessCollection([...files, sessionFile(MON, 2, 77)])), false);
});

test("a Saturday with 3 sessions still blocks even with a Monday alongside", () => {
  const files = [...fullWeekend().filter((f) => f.name !== `ETRANZACT_${SAT}_4.txt`), sessionFile(MON, 1)];
  const c = assessCollection(files).find((x) => x.id === "sessions-complete")!;
  assert.equal(c.status, "fail");
  assert.equal(c.detail, "Missing: Sat 2026/06/06: _4 (5pm).");
});

test("missing sessions can be merged anyway when the user opts in", () => {
  const files = fullWeekend().filter((f) => f.name !== `ETRANZACT_${SAT}_3.txt`);
  assert.equal(canMerge(assessCollection(files)), false);
  const checks = assessCollection(files, { allowMissingSessions: true });
  const c = checks.find((x) => x.id === "sessions-complete");
  assert.equal(c?.status, "warn");
  assert.match(c!.detail, /Merging without: Sat 2026\/06\/06: _3 \(2pm\)/);
  assert.equal(canMerge(checks), true);
});

test("opting in never unblocks other failures", () => {
  const files = [...fullWeekend().filter((f) => f.name !== `ETRANZACT_${SAT}_3.txt`), sessionFile(SAT, 2, 99)];
  assert.equal(canMerge(assessCollection(files, { allowMissingSessions: true })), false);
  const bad = inspectSourceFile(`ETRANZACT_${SAT}_3 (1).txt`, sessionText(SAT, 3));
  assert.equal(canMerge(assessCollection([...fullWeekend(), bad], { allowMissingSessions: true })), false);
});
