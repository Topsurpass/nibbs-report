import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionBoard } from "./board.ts";
import { inspectSourceFile } from "./sourceFile.ts";
import { SAT, SUN, fullWeekend, sessionFile, sessionLines } from "./testFixtures.ts";

test("a full weekend fills two days of four ok slots, in order", () => {
  const board = buildSessionBoard([...fullWeekend()].reverse());
  assert.equal(board.days.length, 2);
  assert.deepEqual(board.days.map((d) => d.date.getDay()), [6, 0]);
  assert.ok(board.days.every((d) => d.weekend && d.filled === 4));
  assert.deepEqual(board.days[0].slots.map((s) => s.label), ["8am", "11am", "2pm", "5pm"]);
  assert.ok(board.days.flatMap((d) => d.slots).every((s) => s.state === "ok"));
  assert.deepEqual(board.unplaced, []);
});

test("missing, duplicate and failed slots are distinguished", () => {
  const broken = sessionLines(SUN, 1);
  broken[0] = broken[0].replace("\t", " ");
  const files = [
    ...fullWeekend().filter((f) => f.name !== `ETRANZACT_${SAT}_3.txt` && f.name !== `ETRANZACT_${SUN}_1.txt`),
    sessionFile(SAT, 2, 42),
    inspectSourceFile(`ETRANZACT_${SUN}_1.txt`, broken.join("\r\n")),
  ];
  const [sat, sun] = buildSessionBoard(files).days;
  assert.equal(sat.slots[2].state, "missing");
  assert.equal(sat.slots[2].expectedName, `ETRANZACT_${SAT}_3.txt`);
  assert.equal(sat.slots[1].state, "duplicate");
  assert.equal(sat.slots[1].files.length, 2);
  assert.equal(sun.slots[0].state, "fail");
});

test("weekday slots are optional, not missing; bad names are unplaced", () => {
  const board = buildSessionBoard([
    sessionFile("05062026", 1),
    inspectSourceFile("ETRANZACT_05062026_1 (1).txt", "x"),
  ]);
  const fri = board.days[0];
  assert.equal(fri.weekend, false);
  assert.equal(fri.required, false);
  assert.deepEqual(fri.slots.map((s) => s.state), ["ok", "optional", "optional", "optional"]);
  assert.equal(board.unplaced.length, 1);
  const sat = buildSessionBoard([sessionFile(SAT, 1)]).days[0];
  assert.equal(sat.required, true);
  assert.deepEqual(sat.slots.map((s) => s.state), ["ok", "missing", "missing", "missing"]);
});
