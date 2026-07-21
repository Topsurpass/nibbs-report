import { test } from "node:test";
import assert from "node:assert/strict";
import { getAppBaseUrl } from "./appUrl.ts";

const req = (url: string) => ({ url }) as Request;

test("prefers APP_URL and strips a trailing slash", () => {
	process.env.APP_URL = "https://nibbs-report.vercel.app/";
	assert.equal(getAppBaseUrl(req("http://localhost:3000/api/users")), "https://nibbs-report.vercel.app");
	delete process.env.APP_URL;
});

test("falls back to the request origin when APP_URL is unset", () => {
	delete process.env.APP_URL;
	assert.equal(getAppBaseUrl(req("http://localhost:3000/api/users")), "http://localhost:3000");
});

test("falls back to the production URL with no env and no request", () => {
	delete process.env.APP_URL;
	assert.equal(getAppBaseUrl(), "https://nibbs-report.vercel.app");
});
