import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isTheme,
	nextTheme,
	resolveTheme,
	THEME_STORAGE_KEY,
	themeInitScript,
} from "./theme.ts";

test("isTheme accepts only light/dark", () => {
	assert.equal(isTheme("light"), true);
	assert.equal(isTheme("dark"), true);
	assert.equal(isTheme("system"), false);
	assert.equal(isTheme(null), false);
	assert.equal(isTheme(undefined), false);
	assert.equal(isTheme("Dark"), false);
	assert.equal(isTheme(""), false);
});

test("resolveTheme: stored choice always wins over system", () => {
	assert.equal(resolveTheme("light", true), "light");
	assert.equal(resolveTheme("dark", false), "dark");
});

test("resolveTheme: falls back to system when no valid stored choice", () => {
	assert.equal(resolveTheme(null, true), "dark");
	assert.equal(resolveTheme(null, false), "light");
	assert.equal(resolveTheme("system", true), "dark");
	assert.equal(resolveTheme("garbage", false), "light");
	assert.equal(resolveTheme(undefined, true), "dark");
});

test("nextTheme flips the theme", () => {
	assert.equal(nextTheme("dark"), "light");
	assert.equal(nextTheme("light"), "dark");
});

test("themeInitScript embeds the storage key and stays self-contained", () => {
	assert.match(themeInitScript, new RegExp(THEME_STORAGE_KEY));
	assert.match(themeInitScript, /classList\.toggle\("dark"/);
	// Must be wrapped in try/catch so a storage exception never blocks paint.
	assert.match(themeInitScript, /try\{/);
	assert.match(themeInitScript, /catch/);
});
