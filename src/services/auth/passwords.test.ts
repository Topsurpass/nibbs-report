import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePassword, hashPassword, verifyPassword } from "./passwords.ts";

test("hashPassword / verifyPassword round-trip", async () => {
	const stored = await hashPassword("correct horse battery staple");
	assert.ok(stored.startsWith("scrypt$"));
	assert.equal(await verifyPassword("correct horse battery staple", stored), true);
});

test("verifyPassword rejects the wrong password", async () => {
	const stored = await hashPassword("s3cret-Pass");
	assert.equal(await verifyPassword("wrong-pass", stored), false);
});

test("same password hashes to different strings (random salt)", async () => {
	const a = await hashPassword("repeat-me");
	const b = await hashPassword("repeat-me");
	assert.notEqual(a, b);
	// ...but both verify.
	assert.equal(await verifyPassword("repeat-me", a), true);
	assert.equal(await verifyPassword("repeat-me", b), true);
});

test("verifyPassword returns false for malformed stored values", async () => {
	assert.equal(await verifyPassword("x", "not-a-hash"), false);
	assert.equal(await verifyPassword("x", "scrypt$"), false);
	assert.equal(await verifyPassword("x", "scrypt$abcd$"), false);
	assert.equal(await verifyPassword("x", ""), false);
});

test("generatePassword length + charset", () => {
	const pw = generatePassword();
	assert.equal(pw.length, 12);
	assert.equal(generatePassword(20).length, 20);
	// Only unambiguous chars — no 0/O/1/I/l.
	const allowed = new Set("ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789");
	const forbidden = new Set("0O1Il");
	for (const ch of generatePassword(500)) {
		assert.ok(allowed.has(ch), `unexpected char "${ch}"`);
		assert.ok(!forbidden.has(ch), `ambiguous char "${ch}"`);
	}
});

test("generatePassword is not constant", () => {
	assert.notEqual(generatePassword(16), generatePassword(16));
});
