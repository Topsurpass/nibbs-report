// End-to-end check for the duty register (night and afternoon shifts).
//
// The gate tests in src/lib/attendance/*.test.ts cover the clock maths in
// isolation. This harness closes the gap they cannot: it drives the real HTTP
// routes against the real database with real session cookies, so it catches the
// failures that only exist at the seams — a night key mangled by the `date`
// column round trip, an authorisation rule that is only enforced in the UI, a
// workbook whose totals row disagrees with the rows above it.
//
//   npm run dev              # in another terminal
//   npm run eval:attendance
//
// It seeds a throwaway analyst and admin, exercises every route, then deletes
// both users (which cascades their attendance rows) and reports the table count
// so a leaked row is impossible to miss. Exits non-zero if any check fails.
//
// The sign-in branch it takes depends on the wall clock: inside 20:30-08:30 it
// verifies the accept path, outside it verifies the refusal. Run it once at
// night and once in the day to cover both.

import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import XLSX from "xlsx";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const raw = neon(process.env.DATABASE_URL);

// Neon over HTTP occasionally stalls on a cold connection (the same blip
// src/services/db/retry.ts absorbs for the app). Without this the eval reports a
// false failure that has nothing to do with the code under test.
const sql = async (...args) => {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await raw(...args);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, Math.min(300 * 2 ** (attempt - 1), 2400)));
    }
  }
  throw lastError;
};
const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3000";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ---- seed two sessions -----------------------------------------------------
const who = {};
for (const [key, role, last] of [["analyst","analyst","Analystuser"], ["admin","admin","Adminuser"]]) {
  const email = `zz-attendance-${key}@test.invalid`;
  const [u] = await sql`
    insert into nibbs_users (first_name, last_name, email, password_hash, role, must_change_password)
    values ('Test', ${last}, ${email}, 'x', ${role}, false)
    on conflict (email) do update set role = excluded.role, must_change_password = false
    returning id`;
  const token = randomBytes(32).toString("hex");
  await sql`insert into nibbs_sessions (user_id, token_hash, expires_at)
            values (${u.id}, ${createHash("sha256").update(token).digest("hex")}, now() + interval '2 hours')`;
  who[key] = { id: u.id, token, email };
}
const call = (path, opts = {}, as = "analyst") =>
  fetch(BASE + path, { ...opts, redirect: "manual",
    headers: { ...(opts.headers ?? {}), cookie: `nibbs_session=${who[as].token}` } });

// ---- night maths, mirrored independently of the app ------------------------
const now = new Date();
const lagos = new Date(now.getTime() + 60 * 60000);
const mod = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
const day = lagos.toISOString().slice(0, 10);
const shift = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const expectedNight = mod >= 1230 ? day : mod < 510 ? shift(day, -1) : null;
const month = (expectedNight ?? day).slice(0, 7);
console.log(`\nLagos now ${String(Math.floor(mod/60)).padStart(2,"0")}:${String(mod%60).padStart(2,"0")} on ${day}`);
console.log(`Window ${expectedNight ? "OPEN → night " + expectedNight : "CLOSED"} · month ${month}\n`);

console.log("A. page + list");
ok("GET /attendance renders for a signed-in analyst", (await call("/attendance")).status === 200);
const list = await (await call(`/api/attendance?month=${month}`)).json();
ok("GET /api/attendance returns the register", list.ok && Array.isArray(list.entries) && list.people.length === 1);
ok("analyst scope is their own only", list.scope === "me");

console.log("\nB. the window is enforced server-side");
const si = await call("/api/attendance/sign-in", { method: "POST" });
const siBody = await si.json();
if (expectedNight) {
  ok("sign-in accepted inside the window", si.status === 200 && siBody.ok, JSON.stringify(siBody));
  ok("it booked the night the shift started on", siBody.entry?.nightDate === expectedNight,
     `got ${siBody.entry?.nightDate} want ${expectedNight}`);
  const again = await (await call("/api/attendance/sign-in", { method: "POST" })).json();
  ok("a second tap is idempotent, not a duplicate", again.ok && again.created === false);
  const so = await (await call("/api/attendance/sign-out", { method: "POST" })).json();
  ok("sign-out closes the night", so.ok && so.entry?.signedOutAt);
  const closedAt = so.entry.signedOutAt;
  const so2res = await call("/api/attendance/sign-out", { method: "POST" });
  const so2 = await so2res.json();
  ok("a second sign-out is refused, not silently ignored", so2res.status === 409 && so2.ok === false,
     `${so2res.status} ${JSON.stringify(so2)}`);
  ok("...and it says the night is locked", so2.locked === true && /admin/i.test(so2.error ?? ""), so2.error);
  ok("...and the original sign-out time is untouched", so2.entry?.signedOutAt === closedAt);

  const si3 = await (await call("/api/attendance/sign-in", { method: "POST" })).json();
  ok("signing in again on a closed night changes nothing", si3.entry?.signedOutAt === closedAt);
  ok("...and it is reported as locked", si3.locked === true, JSON.stringify(si3.message));

  // The lock binds the analyst, not the admin: corrections must still be possible.
  const fix = await call("/api/attendance/entries", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: who.analyst.id, nightDate: expectedNight, signedIn: "20:30", signedOut: "06:00", note: "Left early." }),
  }, "admin");
  const fixBody = await fix.json();
  ok("an admin can still change a locked night", fix.status === 200 && fixBody.ok, JSON.stringify(fixBody));
  ok("...and the change actually took", fixBody.entry?.signedOutAt !== closedAt);
  await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${expectedNight}`, { method: "DELETE" }, "admin");
} else {
  ok("sign-in refused outside the window", si.status === 403 && !siBody.ok, JSON.stringify(siBody));
  ok("...and it says when it opens", /20:30/.test(siBody.error ?? ""), siBody.error);
  const so = await call("/api/attendance/sign-out", { method: "POST" });
  ok("sign-out refused with no open shift", so.status === 403);
}

console.log("\nC. admin corrections");
const night = `${month}-11`;
const add = await call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: who.analyst.id, nightDate: night, signedIn: "21:00", signedOut: "07:15", note: "Forgot to sign in." }),
}, "admin");
const addBody = await add.json();
ok("admin can add a night", add.status === 200 && addBody.ok, JSON.stringify(addBody));
ok("it is stamped as an admin entry", addBody.entry?.source === "admin");
ok("21:00 lands on the night's own evening",
   addBody.entry?.signedInAt === `${night}T20:00:00.000Z`, addBody.entry?.signedInAt);
ok("07:15 lands on the MORNING AFTER",
   addBody.entry?.signedOutAt === `${shift(night,1)}T06:15:00.000Z`, addBody.entry?.signedOutAt);

// The dialog prefills exactly this shift, so it must be accepted and must come
// back as a clean twelve hours.
const defaults = await call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: who.analyst.id, nightDate: shift(night, 1), signedIn: "20:30", signedOut: "08:30" }),
}, "admin");
const defBody = await defaults.json();
ok("the prefilled 20:30 → 08:30 shift is accepted", defaults.status === 200 && defBody.ok, JSON.stringify(defBody));
ok("...and it spans exactly 12 hours",
   defBody.entry && (Date.parse(defBody.entry.signedOutAt) - Date.parse(defBody.entry.signedInAt)) === 12 * 3600000,
   `${defBody.entry?.signedInAt} → ${defBody.entry?.signedOutAt}`);
await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${shift(night, 1)}`, { method: "DELETE" }, "admin");

const bad = await call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: who.analyst.id, nightDate: night, signedIn: "13:00" }),
}, "admin");
ok("a daytime sign-in time is rejected", bad.status === 400, String(bad.status));

const backwards = await call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: who.analyst.id, nightDate: night, signedIn: "23:00", signedOut: "22:00" }),
}, "admin");
ok("sign-out before sign-in is rejected", backwards.status === 400, String(backwards.status));

console.log("\nD. authorisation");
const asAnalyst = await call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: who.analyst.id, nightDate: night, signedIn: "21:00" }),
});
ok("an analyst cannot write the register", asAnalyst.status === 403);
const del = await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${night}`, { method: "DELETE" });
ok("an analyst cannot delete from it", del.status === 403);
const leak = await (await call(`/api/attendance?month=${month}&scope=all`)).json();
ok("scope=all is silently downgraded for an analyst", leak.scope === "me" && leak.people.length === 1);
const teamView = await (await call(`/api/attendance?month=${month}&scope=all`, {}, "admin")).json();
ok("an admin does get the whole team", teamView.scope === "all" && teamView.people.length > 1);
ok("the added night is visible to the admin",
   teamView.entries.some((e) => e.nightDate === night && e.userId === who.analyst.id));
const anon = await fetch(`${BASE}/api/attendance?month=${month}`, { redirect: "manual" });
ok("no session gets 401", anon.status === 401, String(anon.status));

console.log("\nE. the workbook");
const xl = await call(`/api/attendance/export?month=${month}&scope=all`, {}, "admin");
ok("export returns a spreadsheet",
   xl.headers.get("content-type")?.includes("spreadsheetml"), xl.headers.get("content-type"));
ok("with a scoped file name",
   /night-duty-\d{4}-\d{2}-all-analysts\.xlsx/.test(xl.headers.get("content-disposition") ?? ""),
   xl.headers.get("content-disposition"));
const wb = XLSX.read(Buffer.from(await xl.arrayBuffer()), { type: "buffer" });
ok("it has Summary and Nights sheets", wb.SheetNames.join(",") === "Summary,Nights", wb.SheetNames.join(","));
const summary = XLSX.utils.sheet_to_json(wb.Sheets.Summary, { header: 1 });
const totalRow = summary.find((r) => r[0] === "TOTAL");
const bodyRows = summary.slice(summary.findIndex((r) => r[0] === "Analyst") + 1, summary.indexOf(totalRow));
const summed = bodyRows.reduce((n, r) => n + Number(r[2] ?? 0), 0);
ok("the totals row equals the sum of the rows above it",
   Number(totalRow?.[2]) === summed, `total ${totalRow?.[2]} vs sum ${summed}`);
// The file is the attendance record, not the staff list: everybody on it worked.
const zeroRow = bodyRows.find((r) => Number(r[2] ?? 0) === 0);
ok("no zero-night analyst is listed", zeroRow === undefined, JSON.stringify(zeroRow));
ok("the seeded admin (no nights) is absent",
   !bodyRows.some((r) => String(r[1] ?? "").includes("zz-attendance-admin")),
   JSON.stringify(bodyRows.map((r) => r[1])));
ok("the analyst who worked IS listed",
   bodyRows.some((r) => String(r[1] ?? "") === who.analyst.email),
   JSON.stringify(bodyRows.map((r) => r[1])));
// Everyone stays in the denominator, so a reader can still see who is missing.
ok("the totals row still counts the whole roster",
   /^\d+ of \d+ signed in$/.test(String(totalRow?.[1] ?? "")) &&
     Number(String(totalRow[1]).split(" of ")[1].split(" ")[0]) >= bodyRows.length + 1,
   String(totalRow?.[1]));

const nights = XLSX.utils.sheet_to_json(wb.Sheets.Nights, { header: 1 });
// Real analysts may also have worked this date; match the test analyst's row.
const added = nights.find((r) => String(r[0] ?? "").startsWith(night) && r[1] === "Test Analystuser");
ok("the corrected night appears with its hours and note",
   added?.[4] === "10h 15m" && added?.[5] === "Added by admin" && added?.[6] === "Forgot to sign in.",
   JSON.stringify(added));

console.log("\nF. admin delete");
const del2 = await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${night}`, { method: "DELETE" }, "admin");
const del2Body = await del2.json();
ok("admin can remove a night", del2.status === 200 && del2Body.removed === true);
const after = await (await call(`/api/attendance?month=${month}&scope=all`, {}, "admin")).json();
ok("...and it is gone", !after.entries.some((e) => e.nightDate === night && e.userId === who.analyst.id));
// Two admins clicking Remove on the same row: the second is a no-op, not a 500.
const del3 = await (await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${night}`, { method: "DELETE" }, "admin")).json();
ok("removing it twice reports nothing was removed", del3.ok === true && del3.removed === false, JSON.stringify(del3));

console.log("\nG. the Every-night list pages, and groups a shared night");
// Runs last, on a clean slate: a leftover row from a crashed run would throw the
// page counts off, and the assertions below are exact.
await sql`delete from nibbs_night_attendance where user_id in (${who.analyst.id}, ${who.admin.id})`;
// 12 nights for the analyst, plus a second analyst on one of them.
const seeded = [];
for (let d = 1; d <= 12; d++) {
  const n = `${month}-${String(d).padStart(2, "0")}`;
  seeded.push(n);
  await call("/api/attendance/entries", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: who.analyst.id, nightDate: n, signedIn: "20:30", signedOut: "08:30" }),
  }, "admin");
}
const shared = `${month}-12`;
await call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: who.admin.id, nightDate: shared, signedIn: "21:00", signedOut: "07:00" }),
}, "admin");

// The list lives in a tab that is not server-rendered until opened, so check
// the paging through the exact modules NightList renders with, fed by the API.
const { paginate } = await import("../src/lib/paginate.ts");
const { groupNights } = await import("../src/lib/attendance/summary.ts");
const PER_PAGE = 8; // NIGHTS_PER_PAGE in NightList.tsx
const minePage = await (await call(`/api/attendance?month=${month}`)).json();
const view = paginate(groupNights(minePage.entries), 1, PER_PAGE);
ok("the list is paged, not one long scroll", view.pageCount === 2, `${view.pageCount} pages`);
ok("...and it says which nights are on screen", view.from === 1 && view.to === 8 && view.total === 12,
   `${view.from}–${view.to} of ${view.total}`);
const shown = view.items.map((g) => g.nightDate);
ok("exactly one page of nights is rendered", shown.length === 8, `${shown.length}: ${shown.join(",")}`);
ok("the newest nights come first, oldest pushed to page 2",
   shown[0] === `${month}-12` && !shown.includes(`${month}-01`), shown.join(","));

const team = await (await call(`/api/attendance?month=${month}&scope=all`, {}, "admin")).json();
// Real analysts may share this date too; count only the two test users.
const testIds = new Set([who.analyst.id, who.admin.id]);
const onShared = team.entries.filter((e) => e.nightDate === shared && testIds.has(e.userId));
ok("two analysts share the same night in the data", onShared.length === 2, `${onShared.length}`);
ok("both belong to the same night key, so they group under one heading",
   groupNights(onShared).length === 1);

for (const n of seeded) {
  await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${n}`, { method: "DELETE" }, "admin");
}
await call(`/api/attendance/entries?userId=${who.admin.id}&nightDate=${shared}`, { method: "DELETE" }, "admin");



console.log("\nH. afternoon duty");
// Mirrored independently of src/lib/attendance/shifts.ts: weekdays open 12:30,
// weekends 14:30, both close 20:30, sign-out grace until 21:00.
const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
const pmOpen = dow === 0 || dow === 6 ? 870 : 750;
const pmOpenNow = mod >= pmOpen && mod < 1230;
const pmSi = await call("/api/attendance/sign-in?shift=afternoon", { method: "POST" });
const pmSiBody = await pmSi.json();
if (pmOpenNow) {
  ok("afternoon sign-in accepted inside its window", pmSi.status === 200 && pmSiBody.ok, JSON.stringify(pmSiBody));
  ok("...booked as an afternoon on today's date",
     pmSiBody.entry?.shift === "afternoon" && pmSiBody.entry?.nightDate === day, JSON.stringify(pmSiBody.entry));
  const pmSo = await (await call("/api/attendance/sign-out?shift=afternoon", { method: "POST" })).json();
  ok("afternoon sign-out closes it", pmSo.ok && pmSo.entry?.signedOutAt);
  await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${day}&shift=afternoon`, { method: "DELETE" }, "admin");
} else {
  ok("afternoon sign-in refused outside its window", pmSi.status === 403 && !pmSiBody.ok, JSON.stringify(pmSiBody));
  ok("...and it says when the afternoon opens", /Afternoon sign-in opens at \d\d:\d\d/.test(pmSiBody.error ?? ""), pmSiBody.error);
}

// Known weekday and weekend dates in this month.
const dates = Array.from({ length: 28 }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
const isWknd = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const weekday = dates.find((d) => !isWknd(d) && d >= `${month}-10`);
const weekend = dates.find((d) => isWknd(d));
const post = (body) => call("/api/attendance/entries", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}, "admin");

const pmAdd = await post({ userId: who.analyst.id, nightDate: weekday, shift: "afternoon", signedIn: "12:30", signedOut: "20:30" });
const pmAddBody = await pmAdd.json();
ok("admin can add a weekday afternoon 12:30 → 20:30", pmAdd.status === 200 && pmAddBody.ok, JSON.stringify(pmAddBody));
ok("...stored as an afternoon on that same date",
   pmAddBody.entry?.shift === "afternoon" && pmAddBody.entry?.signedInAt === `${weekday}T11:30:00.000Z` &&
   pmAddBody.entry?.signedOutAt === `${weekday}T19:30:00.000Z`, JSON.stringify(pmAddBody.entry));

const pmEarlyWknd = await post({ userId: who.analyst.id, nightDate: weekend, shift: "afternoon", signedIn: "12:30", signedOut: "20:30" });
ok("a weekend afternoon starting 12:30 is rejected (weekends open 14:30)", pmEarlyWknd.status === 400,
   `${pmEarlyWknd.status} ${JSON.stringify(await pmEarlyWknd.json())}`);
const pmWknd = await post({ userId: who.analyst.id, nightDate: weekend, shift: "afternoon", signedIn: "14:30", signedOut: "20:30" });
ok("a weekend afternoon 14:30 → 20:30 is accepted", pmWknd.status === 200);
const pmNightTime = await post({ userId: who.analyst.id, nightDate: weekday, shift: "afternoon", signedIn: "22:00" });
ok("a night-time sign-in on the afternoon register is rejected", pmNightTime.status === 400);

const pmList = await (await call(`/api/attendance?month=${month}&scope=all`, {}, "admin")).json();
const mine = pmList.entries.filter((e) => e.userId === who.analyst.id && e.shift === "afternoon");
ok("the register returns both afternoons, tagged by shift", mine.length === 2, JSON.stringify(mine.map((e) => e.nightDate)));
ok("every entry carries a shift", pmList.entries.every((e) => e.shift === "night" || e.shift === "afternoon"));

const pmXl = await call(`/api/attendance/export?month=${month}&scope=all&shift=afternoon`, {}, "admin");
ok("afternoon export is named for the shift",
   /afternoon-duty-\d{4}-\d{2}-all-analysts\.xlsx/.test(pmXl.headers.get("content-disposition") ?? ""),
   pmXl.headers.get("content-disposition"));
const pmWb = XLSX.read(Buffer.from(await pmXl.arrayBuffer()), { type: "buffer" });
ok("it has Summary and Afternoons sheets", pmWb.SheetNames.join(",") === "Summary,Afternoons", pmWb.SheetNames.join(","));
const pmSummary = XLSX.utils.sheet_to_json(pmWb.Sheets.Summary, { header: 1 });
const pmHeader = pmSummary.find((r) => r[0] === "Analyst");
ok("the count column is headed Afternoons", pmHeader?.[2] === "Afternoons", JSON.stringify(pmHeader));
const pmMe = pmSummary.find((r) => r[1] === who.analyst.email);
ok("it counts the analyst's afternoons (2)", Number(pmMe?.[2]) === 2, JSON.stringify(pmMe));
ok("...and their 14 hours", pmMe?.[5] === "14h 00m", JSON.stringify(pmMe));
const nightXl = XLSX.read(Buffer.from(await (await call(`/api/attendance/export?month=${month}&scope=all`, {}, "admin")).arrayBuffer()), { type: "buffer" });
const nightMe = XLSX.utils.sheet_to_json(nightXl.Sheets.Summary, { header: 1 }).find((r) => r[1] === who.analyst.email);
ok("afternoons never leak into the night export", nightMe === undefined, JSON.stringify(nightMe));

// A night and an afternoon on the same date need the contract step
// (npm run db:contract-afternoon) to have dropped the legacy date-only constraint.
const [legacy] = await sql`
  select count(*)::int as n from pg_constraint
  where conname = 'nibbs_night_attendance_user_id_night_date_key'`;
if (legacy.n === 0) {
  const both = await post({ userId: who.analyst.id, nightDate: weekday, shift: "night", signedIn: "20:30", signedOut: "08:30" });
  ok("a night and an afternoon can share a date", both.status === 200, String(both.status));
  await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${weekday}&shift=night`, { method: "DELETE" }, "admin");
} else {
  console.log("  – same-date night + afternoon skipped: run `npm run db:contract-afternoon` after deploy");
}

const pmDel = await (await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${weekday}&shift=afternoon`, { method: "DELETE" }, "admin")).json();
ok("deleting with shift=afternoon removes the afternoon", pmDel.removed === true, JSON.stringify(pmDel));
await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${weekend}&shift=afternoon`, { method: "DELETE" }, "admin");

// ---- clean up --------------------------------------------------------------
for (const k of Object.keys(who)) {
  await sql`delete from nibbs_users where id = ${who[k].id}`;
}
// Deleting the users cascades their attendance rows. Verify that rather than
// counting the whole table, which also holds real analysts' nights.
const [{ leaked }] = await sql`
  select count(*)::int as leaked from nibbs_users
  where email like 'zz-attendance-%@test.invalid'`;
ok("test users and their rows are cleaned up", leaked === 0, `${leaked} left`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
