import { test } from "node:test";
import assert from "node:assert/strict";
import { filterReports, groupByMonth, splitOfficers } from "./listView.ts";
import type { ScheduleReportListItem } from "./template.ts";

const r = (id: string, reportDate: string, handoverType: string, out: string, inc: string): ScheduleReportListItem => ({
	id,
	reportDate,
	handoverType,
	outgoingOfficers: out,
	incomingOfficers: inc,
	createdAt: `${reportDate}T10:00:00Z`,
});

const reports = [
	r("a", "2026-07-30", "Afternoon to Night", "Tokunbo Ogunjobi", "Temitope Olowosuyi"),
	r("b", "2026-08-02", "Night to Morning", "Tokunbo Ogunjobi", "Seyi Ogunyankinu"),
	r("c", "2026-08-01", "Afternoon to Night", "Charisma Ameh", ""),
	r("d", "2026-07-21", "Night to Morning", "Seyi Ogunyankinu, Tokunbo Ogunjobi", "Chimgaemezu Eluchie"),
];

test("search matches either officer list, case-insensitively, all terms required", () => {
	assert.deepEqual(filterReports(reports, { query: "seyi", type: null }).map((x) => x.id), ["b", "d"]);
	assert.deepEqual(filterReports(reports, { query: "TOKUNBO temitope", type: null }).map((x) => x.id), ["a"]);
	assert.deepEqual(filterReports(reports, { query: "  ", type: null }).length, 4);
	assert.deepEqual(filterReports(reports, { query: "nobody", type: null }), []);
});

test("type filter combines with search", () => {
	assert.deepEqual(filterReports(reports, { query: "", type: "Night to Morning" }).map((x) => x.id), ["b", "d"]);
	assert.deepEqual(filterReports(reports, { query: "chimgaemezu", type: "Night to Morning" }).map((x) => x.id), ["d"]);
});

test("groups newest month first, newest date first inside", () => {
	const g = groupByMonth(reports);
	assert.deepEqual(g.map((x) => x.label), ["August 2026", "July 2026"]);
	assert.deepEqual(g[0].reports.map((x) => x.id), ["b", "c"]);
	assert.deepEqual(g[1].reports.map((x) => x.id), ["a", "d"]);
	assert.deepEqual(groupByMonth([]), []);
});

test("officer lists split on commas and drop blanks", () => {
	assert.deepEqual(splitOfficers("Seyi Ogunyankinu, Tokunbo Ogunjobi"), ["Seyi Ogunyankinu", "Tokunbo Ogunjobi"]);
	assert.deepEqual(splitOfficers(""), []);
	assert.deepEqual(splitOfficers(" , Ada ,"), ["Ada"]);
});
