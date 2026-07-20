import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken, randomToken } from "./tokens.ts";

test("randomToken is 64 hex chars and unique", () => {
	const a = randomToken();
	const b = randomToken();
	assert.match(a, /^[0-9a-f]{64}$/);
	assert.notEqual(a, b);
});

test("hashToken is deterministic and differs by input", () => {
	assert.equal(hashToken("abc"), hashToken("abc"));
	assert.notEqual(hashToken("abc"), hashToken("abd"));
	// SHA-256 hex length.
	assert.match(hashToken("anything"), /^[0-9a-f]{64}$/);
});

test("hashToken does not return the raw token", () => {
	const t = randomToken();
	assert.notEqual(hashToken(t), t);
});
