// End-to-end check for the night-duty register.
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
  const so2 = await (await call("/api/attendance/sign-out", { method: "POST" })).json();
  ok("a second sign-out does not overwrite the first", so2.ok && so2.updated === false);
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
const nights = XLSX.utils.sheet_to_json(wb.Sheets.Nights, { header: 1 });
const added = nights.find((r) => String(r[0] ?? "").startsWith(night));
ok("the corrected night appears with its hours and note",
   added?.[4] === "10h 15m" && added?.[5] === "Added by admin" && added?.[6] === "Forgot to sign in.",
   JSON.stringify(added));

console.log("\nF. admin delete");
const del2 = await call(`/api/attendance/entries?userId=${who.analyst.id}&nightDate=${night}`, { method: "DELETE" }, "admin");
const del2Body = await del2.json();
ok("admin can remove a night", del2.status === 200 && del2Body.removed === true);
const after = await (await call(`/api/attendance?month=${month}&scope=all`, {}, "admin")).json();
ok("...and it is gone", !after.entries.some((e) => e.nightDate === night && e.userId === who.analyst.id));

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
