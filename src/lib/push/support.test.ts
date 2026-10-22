import { test } from "node:test";
import assert from "node:assert/strict";
import { pushSupport, urlBase64ToUint8Array, type BrowserTraits } from "./support.ts";

const chrome: BrowserTraits = {
	hasServiceWorker: true,
	hasPushManager: true,
	hasNotification: true,
	userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
	standalone: false,
	maxTouchPoints: 0,
};
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1";

test("desktop Chrome, Edge, Firefox and Android: supported", () => {
	assert.equal(pushSupport(chrome), "supported");
	assert.equal(pushSupport({ ...chrome, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile" }), "supported");
});

test("iPhone in Safari must be added to the Home Screen first; installed, it works", () => {
	assert.equal(pushSupport({ ...chrome, userAgent: iphone, hasPushManager: false }), "needs-install");
	assert.equal(pushSupport({ ...chrome, userAgent: iphone, standalone: true }), "supported");
	// iPadOS pretends to be a Mac; touch gives it away.
	assert.equal(pushSupport({ ...chrome, userAgent: chrome.userAgent.replace("Chrome/141.0 ", ""), maxTouchPoints: 5 }), "needs-install");
});

test("a browser without the Push API is unsupported", () => {
	assert.equal(pushSupport({ ...chrome, hasPushManager: false }), "unsupported");
	assert.equal(pushSupport({ ...chrome, hasServiceWorker: false }), "unsupported");
});

test("VAPID key decodes from base64url, padding or not", () => {
	assert.deepEqual([...urlBase64ToUint8Array("AQID-_8")], [1, 2, 3, 251, 255]);
	assert.deepEqual([...urlBase64ToUint8Array("AQID")], [1, 2, 3]);
	// A real VAPID public key is 65 bytes, uncompressed P-256 (starts 0x04).
	const key = urlBase64ToUint8Array("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
	assert.equal(key.length, 65);
	assert.equal(key[0], 4);
});
