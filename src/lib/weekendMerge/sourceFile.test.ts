import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectSourceFile } from "./sourceFile.ts";
import { MON, SAT, amountField, sessionLines, sessionText } from "./testFixtures.ts";

const NAME = `ETRANZACT_${SAT}_1.txt`;
const failures = (f: ReturnType<typeof inspectSourceFile>) =>
  f.issues.filter((i) => i.severity === "fail").map((i) => i.message).join(" | ");

test("a well-formed weekend file is valid with no issues", () => {
  const f = inspectSourceFile(NAME, sessionText(SAT, 1));
  assert.equal(f.valid, true, failures(f));
  assert.deepEqual(f.issues, []);
  assert.equal(f.session, 1);
  assert.equal(f.sessionLabel, "8am");
  assert.equal(f.records.length, 4);
  assert.equal(f.lineEndings, "crlf");
  assert.equal(f.sumKobo, BigInt(0));
});

test("filename must match ETRANZACT_<ddmmyyyy>_<1-4>.txt exactly", () => {
  for (const bad of [
    `ETRANZACT_${SAT}_1 (1).txt`,
    `etranzact_${SAT}_1.txt`,
    `ETRANZACT_${SAT}_5.txt`,
    `ETRANZACT_${SAT}_01.txt`,
    `ETRANZACT_${SAT}.txt`,
    `ETRANZACT_31022026_1.txt`,
  ]) {
    const f = inspectSourceFile(bad, sessionText(SAT, 1));
    assert.equal(f.valid, false, bad);
  }
});

test("a space instead of a tab fails at upload", () => {
  const lines = sessionLines(SAT, 1);
  lines[2] = lines[2].replace("\t", " ");
  const f = inspectSourceFile(NAME, lines.join("\r\n"));
  assert.equal(f.valid, false);
  assert.match(failures(f), /record template/);
});

test("a blank line fails", () => {
  const lines = sessionLines(SAT, 1);
  lines.splice(1, 0, "");
  assert.equal(inspectSourceFile(NAME, lines.join("\r\n")).valid, false);
});

test("in-row date must equal the filename date", () => {
  const f = inspectSourceFile(NAME, sessionText(MON, 1));
  assert.equal(f.valid, false);
  assert.match(failures(f), /dated 2026\/06\/08, filename says 2026\/06\/06/);
});

test("rows that do not net to zero fail", () => {
  const lines = sessionLines(SAT, 1);
  lines[0] = lines[0].replace(/[+-]\d{17}\.\d{2}$/, amountField(1));
  const f = inspectSourceFile(NAME, lines.join("\r\n"));
  assert.equal(f.valid, false);
  assert.match(failures(f), /must be 0\.00/);
});

test("mixed line endings fail; all-LF only warns", () => {
  const lines = sessionLines(SAT, 1);
  const mixed = inspectSourceFile(NAME, lines.slice(0, 2).join("\n") + "\r\n" + lines.slice(2).join("\r\n"));
  assert.equal(mixed.valid, false);
  const lf = inspectSourceFile(NAME, lines.join("\n"));
  assert.equal(lf.valid, true);
  assert.equal(lf.issues[0].severity, "warn");
});

test("a weekday file is accepted without any warning", () => {
  const f = inspectSourceFile(`ETRANZACT_${MON}_1.txt`, sessionText(MON, 1));
  assert.equal(f.valid, true);
  assert.deepEqual(f.issues, []);
});

test("an empty file fails", () => {
  assert.equal(inspectSourceFile(NAME, "").valid, false);
});

test("a malformed row is reported once, not also as a non-zero sum", () => {
  // Mirrors a real file: one row with "###" before the code, file otherwise balanced.
  const lines = sessionLines(SAT, 1);
  lines[1] = lines[1].replace(/\t(\d{10})\t/, "\t###$1\t");
  const f = inspectSourceFile(NAME, lines.join("\r\n"));
  assert.equal(f.valid, false);
  assert.match(failures(f), /account must be exactly 10 digits/);
  assert.doesNotMatch(failures(f), /must be 0\.00/);
});
