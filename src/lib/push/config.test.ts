import { test } from "node:test";
import assert from "node:assert/strict";
import { readPushConfig } from "./config.ts";

test("both keys set: enabled, nothing missing", () => {
	const c = readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.c" });
	assert.deepEqual([c.enabled, c.publicKey, c.privateKey, c.subject, c.missing], [true, "BPub", "priv", "mailto:a@b.c", []]);
});

test("names exactly which settings are missing", () => {
	assert.deepEqual(readPushConfig({}).missing, ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]);
	assert.deepEqual(readPushConfig({ VAPID_PRIVATE_KEY: "p" }).missing, ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]);
	assert.equal(readPushConfig({ VAPID_PRIVATE_KEY: "p" }).enabled, false);
});

test("the public key may be set without the NEXT_PUBLIC_ prefix", () => {
	const c = readPushConfig({ VAPID_PUBLIC_KEY: "BPub", VAPID_PRIVATE_KEY: "p" });
	assert.equal(c.enabled, true);
	assert.equal(c.publicKey, "BPub");
});

test("blank or quoted values pasted into a dashboard are handled", () => {
	assert.deepEqual(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "  ", VAPID_PRIVATE_KEY: '"p"' }).missing, ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]);
	assert.equal(readPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: ' "BPub" ', VAPID_PRIVATE_KEY: "p" }).publicKey, "BPub");
});
