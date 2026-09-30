import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttendanceExport, buildSummaryImage, formatLagosStamp } from "./exportAttendance.ts";
import type { AttendanceEntry, AttendancePerson } from "./types.ts";

const ada: AttendancePerson = {
	id: "u1", firstName: "Ada", lastName: "Obi", email: "ada@example.com",
};
const bode: AttendancePerson = {
	id: "u2", firstName: "Bode", lastName: "Ayo", email: "bode@example.com",
};

const GENERATED = new Date("2026-10-01T09:00:00Z");

function night(userId: string, date: string, hours: number | null): AttendanceEntry {
	const inAt = new Date(`${date}T19:30:00.000Z`);
	return {
		id: `${userId}-${date}`,
		userId,
		nightDate: date,
		signedInAt: inAt.toISOString(),
		signedOutAt: hours === null ? null : new Date(inAt.getTime() + hours * 3_600_000).toISOString(),
		source: "self",
		note: null,
		recordedBy: null,
	};
}

const entries = [night("u1", "2026-09-04", 12), night("u1", "2026-09-05", null), night("u2", "2026-09-04", 11)];

const build = (scope: "me" | "all", people = [ada, bode], rows = entries) =>
	buildAttendanceExport({ month: "2026-09", people, entries: rows, scope, generatedAt: GENERATED });

test("formatLagosStamp renders Lagos wall clock and survives bad input", () => {
	assert.equal(formatLagosStamp("2026-09-04T19:30:00.000Z"), "2026-09-04 20:30");
	assert.equal(formatLagosStamp("2026-09-04T23:45:00.000Z"), "2026-09-05 00:45");
	assert.equal(formatLagosStamp(null), "—");
	assert.equal(formatLagosStamp("not a date"), "—");
});

test("summary sheet lists every analyst and ends with a totals row", () => {
	const model = build("all");
	const { aoa, headerRow, totalsRow } = model.summary;

	assert.equal(aoa[headerRow - 1][0], "Analyst");
	assert.equal(aoa[headerRow][0], "Ada Obi");
	assert.equal(aoa[headerRow + 1][0], "Bode Ayo");

	const total = aoa[(totalsRow ?? 0) - 1];
	assert.equal(total[0], "TOTAL");
	assert.equal(total[2], 3); // three nights across both analysts
	assert.equal(total[4], 1); // one still open
	assert.equal(total[5], "23h 00m"); // 12h + 11h; the open night adds nothing
});

test("the totals row equals the sum of the analyst rows above it", () => {
	const { aoa, headerRow, totalsRow } = build("all").summary;
	const body = aoa.slice(headerRow, (totalsRow ?? 0) - 1);
	const nights = body.reduce((n, row) => n + Number(row[2]), 0);
	assert.equal(nights, Number(aoa[(totalsRow ?? 0) - 1][2]));
});

test("nights sheet has one row per entry, newest night first, open shown as a dash", () => {
	const { aoa, headerRow } = build("all").nights;
	const body = aoa.slice(headerRow);

	assert.equal(body.length, 3);
	assert.equal(body[0][0], "2026-09-05 (Sat 5 Sep)");
	assert.equal(body[0][3], "—"); // never signed out
	assert.equal(body[0][4], "—"); // so hours are unknown, not 0h 00m
	assert.equal(body[1][2], "2026-09-04 20:30");
	assert.equal(body[1][4], "12h 00m");
});

test("an admin-added night is labelled as such and carries its note", () => {
	const added: AttendanceEntry = {
		...night("u1", "2026-09-10", 12),
		source: "admin",
		note: "Forgot to sign in; confirmed on the handover sheet.",
		recordedBy: "admin-1",
	};
	const { aoa, headerRow } = build("all", [ada, bode], [added]).nights;
	assert.equal(aoa[headerRow][5], "Added by admin");
	assert.equal(aoa[headerRow][6], "Forgot to sign in; confirmed on the handover sheet.");
});

test("an empty month still produces a readable sheet", () => {
	const model = build("all", [ada, bode], []);
	const { aoa, headerRow } = model.nights;
	assert.equal(aoa[headerRow][0], "No nights recorded in September 2026.");

	// The summary has nobody to list, so it says so rather than printing two
	// rows of zeroes, and every row still matches the column count.
	const summary = model.summary;
	assert.equal(summary.aoa[summary.headerRow][0], "No analyst signed in during September 2026.");
	assert.equal(summary.aoa[(summary.totalsRow ?? 0) - 1][0], "TOTAL");
	for (const row of summary.aoa.slice(summary.headerRow - 1)) {
		assert.equal(row.length, summary.widths.length);
	}

	const image = buildSummaryImage({
		month: "2026-09", people: [ada, bode], entries: [], scope: "all", generatedAt: GENERATED,
	});
	assert.equal(image.rows.length, 0);
	assert.equal(image.emptyNote, "No analyst signed in during September 2026.");
});

test("exports skip analysts who did no nights, but still count them in the total", () => {
	// Bode worked; Ada did not. Ada belongs on the roster, not in the file.
	const onlyBode = [night("u2", "2026-09-04", 11)];
	const summary = build("all", [ada, bode], onlyBode).summary;
	const body = summary.aoa.slice(summary.headerRow, (summary.totalsRow ?? 0) - 1);

	assert.equal(body.length, 1);
	assert.equal(body[0][0], "Bode Ayo");
	assert.ok(!body.some((row) => row[0] === "Ada Obi"));

	// The denominator is still the whole team, so a reader can see who is missing.
	assert.equal(summary.aoa[(summary.totalsRow ?? 0) - 1][1], "1 of 2 signed in");

	const image = buildSummaryImage({
		month: "2026-09", people: [ada, bode], entries: onlyBode, scope: "all",
		generatedAt: GENERATED,
	});
	assert.deepEqual(image.rows.map((r) => r[0]), ["Bode Ayo"]);
	assert.equal(image.subtitle, "1 of 2 analysts signed in");
	assert.equal(image.emptyNote, undefined);
});

test("file names are scope-specific and shell-safe", () => {
	assert.equal(build("all").fileName, "night-duty-2026-09-all-analysts.xlsx");
	assert.equal(build("me", [ada]).fileName, "night-duty-2026-09-ada-obi.xlsx");
	const odd: AttendancePerson = {
		id: "u9", firstName: "Ngozi (Temp)", lastName: 'O"Brien/Ade', email: "n@example.com",
	};
	assert.match(build("me", [odd], []).fileName, /^night-duty-2026-09-[a-z0-9-]+\.xlsx$/);
});

test("every summary sheet row has one cell per column width", () => {
	const { aoa, widths, headerRow } = build("all").summary;
	for (const row of aoa.slice(headerRow - 1)) {
		assert.equal(row.length, widths.length, `row [${row.join("|")}]`);
	}
});

test("the JPEG model reports exactly the same totals as the workbook", () => {
	const image = buildSummaryImage({
		month: "2026-09", people: [ada, bode], entries, scope: "all", generatedAt: GENERATED,
	});
	const sheet = build("all").summary;
	const sheetTotal = sheet.aoa[(sheet.totalsRow ?? 0) - 1];

	assert.equal(image.rows.length, 2);
	assert.equal(image.totals[0], "TOTAL");
	assert.equal(image.totals[1], String(sheetTotal[2]));
	assert.equal(image.totals[2], sheetTotal[5]);
	assert.equal(image.fileName, "night-duty-2026-09-all-analysts.jpg");
	// Column count must match the row shape or the painter draws ragged cells.
	assert.ok(image.rows.every((r) => r.length === image.columns.length));
	assert.equal(image.totals.length, image.columns.length);
});
