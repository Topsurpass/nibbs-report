import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCollection, canMerge } from "./collection.ts";
import { inspectSourceFile } from "./sourceFile.ts";
import { SAT, fullWeekend, sessionFile, sessionText } from "./testFixtures.ts";

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

test("a gap between days and a weekday holiday only warn", () => {
  const fri = [1, 2, 3, 4].map((s) => sessionFile("05062026", s));
  const tue = [1, 2, 3, 4].map((s) => sessionFile("09062026", s));
  const files = [...fri, ...fullWeekend(), ...tue]; // Fri, Sat, Sun, (Mon missing), Tue
  assert.equal(status(files, "contiguous"), "warn");
  assert.equal(status(files, "non-business-days"), "warn");
  assert.equal(canMerge(assessCollection(files)), true);
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
