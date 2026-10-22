import { test } from "node:test";
import assert from "node:assert/strict";
import { isPushServiceEndpoint } from "./endpoints.ts";

test("real browser push services are accepted", () => {
	for (const e of [
		"https://fcm.googleapis.com/fcm/send/abc:APA91b",
		"https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
		"https://web.push.apple.com/QGmR",
		"https://wns2-par02p.notify.windows.com/w/?token=x",
	]) assert.equal(isPushServiceEndpoint(e), true, e);
});

test("anything else is refused: other hosts, look-alikes, http, junk", () => {
	for (const e of [
		"https://evil.example.com/fcm.googleapis.com",
		"https://fcm.googleapis.com.evil.com/x",
		"https://notfcm.googleapis.com.attacker.io/",
		"http://fcm.googleapis.com/fcm/send/x",
		"https://169.254.169.254/latest/meta-data",
		"not a url",
	]) assert.equal(isPushServiceEndpoint(e), false, e);
});

test("localhost only when explicitly allowed (the eval's mock push service)", () => {
	assert.equal(isPushServiceEndpoint("https://127.0.0.1:9443/dev/a"), false);
	assert.equal(isPushServiceEndpoint("https://127.0.0.1:9443/dev/a", { allowLocal: true }), true);
	assert.equal(isPushServiceEndpoint("https://localhost:9443/dev/a", { allowLocal: true }), true);
});
