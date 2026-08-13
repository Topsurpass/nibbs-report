import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clampStep,
	markSeen,
	parseSeen,
	shouldShowTour,
	type SeenTours,
} from "./tourState.ts";

const TOUR = { id: "escalation", version: 1 };

test("parseSeen handles an empty or missing store", () => {
	assert.deepEqual(parseSeen(null), {});
	assert.deepEqual(parseSeen(undefined), {});
	assert.deepEqual(parseSeen(""), {});
	assert.deepEqual(parseSeen("{}"), {});
});

test("parseSeen survives corrupt storage instead of throwing", () => {
	// A user with junk in localStorage must still get the app, not a crash.
	assert.deepEqual(parseSeen("not json"), {});
	assert.deepEqual(parseSeen("[1,2,3]"), {});
	assert.deepEqual(parseSeen("null"), {});
	assert.deepEqual(parseSeen('"a string"'), {});
});

test("parseSeen keeps numeric versions and drops everything else", () => {
	assert.deepEqual(parseSeen('{"escalation":2,"bogus":"x","nan":null}'), {
		escalation: 2,
	});
});

test("an unseen tour shows", () => {
	assert.ok(shouldShowTour({}, TOUR));
	assert.ok(shouldShowTour({ other: 5 }, TOUR));
});

test("a completed tour does not show again", () => {
	assert.ok(!shouldShowTour({ escalation: 1 }, TOUR));
	// A version ahead of ours (downgrade) is still "seen".
	assert.ok(!shouldShowTour({ escalation: 9 }, TOUR));
});

test("bumping the version re-shows the tour", () => {
	const seen: SeenTours = { escalation: 1 };
	assert.ok(!shouldShowTour(seen, { id: "escalation", version: 1 }));
	assert.ok(shouldShowTour(seen, { id: "escalation", version: 2 }));
});

test("markSeen records the version without mutating the input", () => {
	const seen: SeenTours = { other: 3 };
	const next = markSeen(seen, TOUR);
	assert.deepEqual(next, { other: 3, escalation: 1 });
	assert.deepEqual(seen, { other: 3 }, "input must not be mutated");
	assert.ok(!shouldShowTour(next, TOUR));
});

test("markSeen overwrites an older version", () => {
	const next = markSeen({ escalation: 1 }, { id: "escalation", version: 4 });
	assert.equal(next.escalation, 4);
});

test("clampStep keeps the index inside the deck", () => {
	assert.equal(clampStep(0, 5), 0);
	assert.equal(clampStep(3, 5), 3);
	assert.equal(clampStep(4, 5), 4);
	assert.equal(clampStep(5, 5), 4, "past the end clamps to the last step");
	assert.equal(clampStep(-1, 5), 0);
	assert.equal(clampStep(1.7, 5), 1);
});

test("clampStep copes with an empty deck and junk input", () => {
	assert.equal(clampStep(2, 0), 0);
	assert.equal(clampStep(Number.NaN, 5), 0);
	assert.equal(clampStep(Number.POSITIVE_INFINITY, 5), 0);
});

test("a full round trip: unseen -> shown -> completed -> not shown", () => {
	let seen = parseSeen(null);
	assert.ok(shouldShowTour(seen, TOUR));
	seen = markSeen(seen, TOUR);
	const persisted = JSON.stringify(seen);
	assert.ok(!shouldShowTour(parseSeen(persisted), TOUR));
});
