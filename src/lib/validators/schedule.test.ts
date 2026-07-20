import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleReportSchema } from "./schedule.ts";
import { blankReport } from "../schedule/template.ts";

test("a template report validates", () => {
	const r = blankReport({ date: "2026-07-20", outgoingOfficers: "Ada A" });
	assert.equal(scheduleReportSchema.safeParse(r).success, true);
});

test("missing date is rejected", () => {
	const r = blankReport({ date: "2026-07-20" });
	r.cover.date = "";
	assert.equal(scheduleReportSchema.safeParse(r).success, false);
});

test("bad handover type is rejected", () => {
	const r = blankReport({ date: "2026-07-20" });
	// @ts-expect-error intentionally invalid
	r.cover.handoverType = "Whenever";
	assert.equal(scheduleReportSchema.safeParse(r).success, false);
});

test("empty department is rejected", () => {
	const r = blankReport({ date: "2026-07-20" });
	r.cover.department = "";
	assert.equal(scheduleReportSchema.safeParse(r).success, false);
});
