import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "./paginate.ts";

const items = Array.from({ length: 23 }, (_, i) => i + 1);

test("splits into pages and reports a 1-based range", () => {
	const first = paginate(items, 1, 10);
	assert.deepEqual(first.items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	assert.equal(first.pageCount, 3);
	assert.equal(first.from, 1);
	assert.equal(first.to, 10);
	assert.equal(first.total, 23);
	assert.equal(first.hasPrevious, false);
	assert.equal(first.hasNext, true);
});

test("the last page holds the remainder", () => {
	const last = paginate(items, 3, 10);
	assert.deepEqual(last.items, [21, 22, 23]);
	assert.equal(last.from, 21);
	assert.equal(last.to, 23);
	assert.equal(last.hasNext, false);
	assert.equal(last.hasPrevious, true);
});

test("a page beyond the end clamps to the last page instead of rendering blank", () => {
	const over = paginate(items, 99, 10);
	assert.equal(over.page, 3);
	assert.deepEqual(over.items, [21, 22, 23]);
});

test("a page below 1, or a junk page, clamps to the first", () => {
	for (const page of [0, -5, Number.NaN]) {
		const p = paginate(items, page, 10);
		assert.equal(p.page, 1, String(page));
		assert.equal(p.items[0], 1);
	}
});

test("an empty list is page 1 of 1, with an empty range", () => {
	const empty = paginate([], 1, 10);
	assert.deepEqual(empty.items, []);
	assert.equal(empty.page, 1);
	assert.equal(empty.pageCount, 1);
	assert.equal(empty.from, 0);
	assert.equal(empty.to, 0);
	assert.equal(empty.total, 0);
	assert.equal(empty.hasPrevious, false);
	assert.equal(empty.hasNext, false);
});

test("an exact multiple does not produce a trailing empty page", () => {
	const exact = paginate(items.slice(0, 20), 1, 10);
	assert.equal(exact.pageCount, 2);
	assert.equal(paginate(items.slice(0, 20), 2, 10).items.length, 10);
});

test("a nonsense page size falls back to one item per page rather than dividing by zero", () => {
	assert.equal(paginate(items, 1, 0).pageCount, 23);
	assert.equal(paginate(items, 1, -3).items.length, 1);
});

test("every item appears exactly once across all pages", () => {
	const seen: number[] = [];
	for (let p = 1; p <= paginate(items, 1, 7).pageCount; p++) {
		seen.push(...paginate(items, p, 7).items);
	}
	assert.deepEqual(seen, items);
});

test("does not mutate the input", () => {
	const input = [3, 1, 2];
	paginate(input, 1, 2);
	assert.deepEqual(input, [3, 1, 2]);
});
