// End-to-end check that NIBBS Settings is read-only for everyone but admins.
//
// The gate test in src/lib/permissions.test.ts pins the rule itself. This drives
// the real routes and the real page with real session cookies, which is the only
// place the interesting failure lives: a guard that is enforced in the UI but not
// in the API, or a screen that renders Save for somebody the API will refuse.
//
//   npm run dev                  # in another terminal
//   npm run eval:nibbs-settings
//
// SAFETY: the master bank list is live shared reference data. The list is
// snapshotted to disk before anything is written, every write is restored to the
// snapshot, and the final check re-reads the list and compares it byte for byte
// with the snapshot. POST /api/banks/reset is deliberately NOT exercised as an
// admin: it discards every collateral figure the team has entered, and proving
// the guard on it does not need the destructive half — the analyst and anonymous
// refusals below run against the real handler, which shares one guard with PUT.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const raw = neon(process.env.DATABASE_URL);

// Neon over HTTP occasionally stalls on a cold connection (the same blip
// src/services/db/retry.ts absorbs for the app).
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
const SNAPSHOT_DIR = process.env.EVAL_SNAPSHOT_DIR ?? "/tmp/eval-nibbs-settings";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ---- seed one analyst and one admin ---------------------------------------
const who = {};
for (const [key, role, last] of [["analyst","analyst","Analystuser"], ["admin","admin","Adminuser"]]) {
  const email = `zz-settings-${key}@test.invalid`;
  const [u] = await sql`
    insert into nibbs_users (first_name, last_name, email, password_hash, role, must_change_password)
    values ('Test', ${last}, ${email}, 'x', ${role}, false)
    on conflict (email) do update set role = excluded.role, must_change_password = false
    returning id`;
  const token = randomBytes(32).toString("hex");
  // `on conflict do nothing` because the retry wrapper above re-sends a request
  // whose response was lost, and a bare insert is not idempotent: the row lands
  // twice and trips the unique index on token_hash.
  await sql`insert into nibbs_sessions (user_id, token_hash, expires_at)
            values (${u.id}, ${createHash("sha256").update(token).digest("hex")}, now() + interval '2 hours')
            on conflict (token_hash) do nothing`;
  who[key] = { id: u.id, token, email };
}
const call = (path, opts = {}, as = "analyst") =>
  fetch(BASE + path, { ...opts, redirect: "manual",
    headers: { ...(opts.headers ?? {}), cookie: `nibbs_session=${who[as].token}` } });
const getList = async (as = "admin") => {
  const body = await (await call("/api/banks", {}, as)).json();
  // Fail loudly: a refused read would otherwise stringify to `undefined` and
  // show up as "the list changed", sending the reader after a data problem that
  // does not exist.
  if (!Array.isArray(body.banks)) throw new Error(`could not read the list as ${as}: ${JSON.stringify(body)}`);
  return body.banks;
};
const put = (banks, as) =>
  call("/api/banks", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(banks),
  }, as);

// ---- snapshot the live list before touching anything -----------------------
const snapshot = await getList("admin");
mkdirSync(SNAPSHOT_DIR, { recursive: true });
const snapshotPath = `${SNAPSHOT_DIR}/master-banks-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
const frozen = JSON.stringify(snapshot);
console.log(`\n${snapshot.length} banks snapshotted to ${snapshotPath}`);
if (!Array.isArray(snapshot) || snapshot.length === 0) {
  console.log("  ✗ refusing to run: could not read the master list, so nothing could be restored");
  process.exit(1);
}

console.log("\nA. everybody can see the settings");
ok("an analyst can open /settings", (await call("/settings")).status === 200);
const analystList = await (await call("/api/banks")).json();
ok("an analyst can read the master list",
   analystList.ok && analystList.banks.length === snapshot.length, JSON.stringify(analystList).slice(0, 120));
ok("an admin can read it too", (await getList("admin")).length === snapshot.length);
const anonGet = await fetch(`${BASE}/api/banks`, { redirect: "manual" });
ok("no session gets 401 on read", anonGet.status === 401, String(anonGet.status));

console.log("\nB. only an admin can change it");
// A payload that would be perfectly valid if the caller were allowed: the
// refusal has to come from the role, not from validation.
const tampered = snapshot.map((b, i) => (i === 0 ? { ...b, collateral: Number(b.collateral) + 1 } : b));
const analystPut = await put(tampered, "analyst");
const analystPutBody = await analystPut.json();
ok("an analyst's save is refused", analystPut.status === 403, String(analystPut.status));
ok("...with a message naming who can", /admin/i.test(analystPutBody.error ?? ""), JSON.stringify(analystPutBody));
ok("...and the list is untouched", JSON.stringify(await getList("admin")) === frozen);

const analystReset = await call("/api/banks/reset", { method: "POST" }, "analyst");
ok("an analyst's reset-to-defaults is refused", analystReset.status === 403, String(analystReset.status));
ok("...and the list is still untouched", JSON.stringify(await getList("admin")) === frozen);

const anonPut = await fetch(`${BASE}/api/banks`, {
  method: "PUT", redirect: "manual",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(tampered),
});
ok("no session gets 401 on save", anonPut.status === 401, String(anonPut.status));
const anonReset = await fetch(`${BASE}/api/banks/reset`, { method: "POST", redirect: "manual" });
ok("no session gets 401 on reset", anonReset.status === 401, String(anonReset.status));

console.log("\nC. an admin is not locked out");
const adminPut = await put(tampered, "admin");
const adminPutBody = await adminPut.json();
ok("an admin's save is accepted", adminPut.status === 200 && adminPutBody.ok, JSON.stringify(adminPutBody).slice(0, 120));
ok("...and it actually landed",
   Number((await getList("admin")).find((b) => b.code === snapshot[0].code)?.collateral) ===
     Number(snapshot[0].collateral) + 1);

// Restore immediately: everything after this point runs against the real list.
await put(snapshot, "admin");
ok("the snapshot is restored byte for byte", JSON.stringify(await getList("admin")) === frozen);

console.log("\nD. the screen itself renders read-only");
const analystPage = await (await call("/settings")).text();
const adminPage = await (await call("/settings", {}, "admin")).text();

// Markers chosen for stability. The save button's label is state-dependent
// ("Saved" until something is dirty), so the editable inputs stand in for it:
// the placeholder only exists on a row rendered as a form.
const EDIT_MARKERS = {
  "Import Excel": "Import Excel",
  "Add bank": "Add bank",
  "Reset to defaults": "Reset to defaults",
  "editable rows": "10-digit code",
};
const missingFor = (html) =>
  Object.entries(EDIT_MARKERS).filter(([, needle]) => !html.includes(needle)).map(([name]) => name);
const presentFor = (html) =>
  Object.entries(EDIT_MARKERS).filter(([, needle]) => html.includes(needle)).map(([name]) => name);

const analystHas = presentFor(analystPage);
ok("an analyst gets none of the editing controls", analystHas.length === 0, `found: ${analystHas.join(", ")}`);
ok("an analyst is told it is view only", /View only/.test(analystPage));
ok("...but still sees the bank data", analystPage.includes(snapshot[0].name));

const adminMissing = missingFor(adminPage);
ok("an admin still gets the full editor", adminMissing.length === 0, `missing: ${adminMissing.join(", ")}`);
ok("an admin is not shown the view-only notice", !/View only/.test(adminPage));

// Before cleanup: deleting the seeded users cascades their sessions, and the
// cookies above stop working the moment they go.
ok("the master list is exactly as it was found", JSON.stringify(await getList("admin")) === frozen);

// ---- clean up --------------------------------------------------------------
for (const k of Object.keys(who)) {
  await sql`delete from nibbs_users where id = ${who[k].id}`;
}
const [{ leaked }] = await sql`
  select count(*)::int as leaked from nibbs_users
  where email like 'zz-settings-%@test.invalid'`;
ok("test users are cleaned up", leaked === 0, `${leaked} left`);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`snapshot kept at ${snapshotPath}`);
process.exit(fail === 0 ? 0 : 1);
