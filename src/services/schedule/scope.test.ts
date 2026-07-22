import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerFilter } from "./scope.ts";

test("analyst is scoped to their own user id", () => {
	assert.equal(ownerFilter({ userId: "u-123", role: "analyst" }), "u-123");
});

test("admin sees everything (no filter)", () => {
	assert.equal(ownerFilter({ userId: "u-admin", role: "admin" }), null);
});

test("no scope (system/unscoped caller) applies no filter", () => {
	assert.equal(ownerFilter(undefined), null);
});
