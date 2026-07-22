import { test } from "node:test";
import assert from "node:assert/strict";
import {
	sessionFromHtmlName,
	sessionFromTxtSequence,
	resolveSession,
	sessionRowLabel,
} from "./nibbsSession.ts";

test("HTML letter → session, with and without extension, any case", () => {
	assert.equal(sessionFromHtmlName("2026-07-22 A.html"), "8am");
	assert.equal(sessionFromHtmlName("2026-07-22 B.html"), "11am");
	assert.equal(sessionFromHtmlName("2026-07-22 C.htm"), "2pm");
	assert.equal(sessionFromHtmlName("2026-07-22 D"), "5pm");
	assert.equal(sessionFromHtmlName("2026-07-22 b.HTML"), "11am");
	assert.equal(sessionFromHtmlName("frame_2026-07-22_C.html"), "2pm");
});

test("HTML letter → undefined when there's no A-D suffix", () => {
	assert.equal(sessionFromHtmlName("2026-07-22.html"), undefined);
	assert.equal(sessionFromHtmlName("2026-07-22 E.html"), undefined);
	assert.equal(sessionFromHtmlName("settlement.html"), undefined);
});

test("txt sequence → session", () => {
	assert.equal(sessionFromTxtSequence("1"), "8am");
	assert.equal(sessionFromTxtSequence("2"), "11am");
	assert.equal(sessionFromTxtSequence("3"), "2pm");
	assert.equal(sessionFromTxtSequence("4"), "5pm");
	assert.equal(sessionFromTxtSequence("5"), undefined);
	assert.equal(sessionFromTxtSequence(undefined), undefined);
});

test("resolveSession: both present and agree → confident, match=true", () => {
	const r = resolveSession("2026-07-22 B.html", "2");
	assert.equal(r.label, "11am");
	assert.equal(r.match, true);
	assert.equal(r.error, undefined);
});

test("resolveSession: both present and disagree → no label, match=false, error", () => {
	const r = resolveSession("2026-07-22 B.html", "3");
	assert.equal(r.label, undefined);
	assert.equal(r.match, false);
	assert.equal(r.htmlLabel, "11am");
	assert.equal(r.txtLabel, "2pm");
	assert.match(r.error ?? "", /mismatch/i);
});

test("resolveSession: only one source resolves → falls back to it, match=false", () => {
	const onlyTxt = resolveSession("settlement.html", "4");
	assert.equal(onlyTxt.label, "5pm");
	assert.equal(onlyTxt.match, false);

	const onlyHtml = resolveSession("2026-07-22 A.html", "9");
	assert.equal(onlyHtml.label, "8am");
	assert.equal(onlyHtml.match, false);
});

test("resolveSession: neither resolves → error, no label", () => {
	const r = resolveSession("settlement.html", undefined);
	assert.equal(r.label, undefined);
	assert.equal(r.match, false);
	assert.ok(r.error);
});

test("sessionRowLabel formats the row detail", () => {
	assert.equal(sessionRowLabel("11am"), "11am NIBBS");
});
