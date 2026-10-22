// End-to-end check of Duty Register push notifications against a running app.
//
//   PUSH_ALLOW_LOCAL_TEST_ENDPOINTS=1 npm run dev     # in another terminal
//   npm run eval:push
//
// It stands up a mock browser push service on https://127.0.0.1 (self-signed),
// seeds three throwaway users each with a fake "device" (a real P-256 key pair),
// and drives the real routes. Every push the app sends is captured, decrypted
// with the device's keys (RFC 8291, aes128gcm) and checked:
//   A. subscribe: auth required, non-push hosts refused, devices registered
//   B. team alerts: A signs in / out → B and C each get it once, A gets nothing
//   C. reminders via the cron: secret required, sign-in at the open, once only,
//      "not on duty" respected, the follow-up nudge, sign-out at the close
//   D. a device the push service reports gone (410) is pruned
// Then deletes the users (cascading devices, logs, dismissals and shifts).
// The cron runs are scoped to the test users and a 2020 date, so real people's
// reminders are never touched. Exits non-zero on any failure.

import { readFileSync, mkdtempSync } from "node:fs";
import { createECDH, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
	const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
	if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const raw = neon(process.env.DATABASE_URL);
const sql = async (...args) => {
	let last;
	for (let i = 0; i < 5; i++) {
		try {
			return await raw(...args);
		} catch (err) {
			last = err;
			await new Promise((r) => setTimeout(r, 300 * 2 ** i));
		}
	}
	throw last;
};
const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
	if (cond) {
		pass++;
		console.log(`  ✓ ${name}`);
	} else {
		fail++;
		console.log(`  ✗ ${name} ${extra}`);
	}
};

// ---- mock push service -------------------------------------------------------
const certDir = mkdtempSync(join(tmpdir(), "push-eval-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(certDir, "k.pem"), "-out", join(certDir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
const inbox = new Map(); // device id → [{ headers, body }]
const respondWith = new Map(); // device id → status code
const server = createServer({ key: readFileSync(join(certDir, "k.pem")), cert: readFileSync(join(certDir, "c.pem")) }, (req, res) => {
	const chunks = [];
	req.on("data", (c) => chunks.push(c));
	req.on("end", () => {
		const id = req.url.split("/").pop();
		const status = respondWith.get(id) ?? 201;
		if (status === 201) inbox.set(id, [...(inbox.get(id) ?? []), { headers: req.headers, body: Buffer.concat(chunks) }]);
		res.writeHead(status).end();
	});
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

// ---- RFC 8291 decryption (what a browser does with a push) -------------------
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function decrypt(device, body) {
	const salt = body.subarray(0, 16);
	const idlen = body[20];
	const asPublic = body.subarray(21, 21 + idlen);
	const ciphertext = body.subarray(21 + idlen);
	const ecdhSecret = device.ecdh.computeSecret(asPublic);
	const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), device.publicKey, asPublic]);
	const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, device.auth, keyInfo, 32));
	const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
	const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
	const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
	decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
	const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
	let end = plain.length - 1;
	while (end > 0 && plain[end] === 0) end--; // strip padding, then the 0x02 delimiter
	return JSON.parse(plain.subarray(0, end).toString("utf8"));
}

// ---- users, sessions and devices ----------------------------------------------
const who = {};
for (const [key, role, first] of [["a", "analyst", "Ada"], ["b", "analyst", "Bola"], ["c", "admin", "Chidi"]]) {
	const email = `zz-push-${key}@test.invalid`;
	const [u] = await sql`
		insert into nibbs_users (first_name, last_name, email, password_hash, role, must_change_password)
		values (${first}, 'Pushtest', ${email}, 'x', ${role}, false)
		on conflict (email) do update set role = excluded.role, must_change_password = false
		returning id`;
	const token = randomBytes(32).toString("hex");
	await sql`insert into nibbs_sessions (user_id, token_hash, expires_at)
		values (${u.id}, ${createHash("sha256").update(token).digest("hex")}, now() + interval '1 hour')`;
	const ecdh = createECDH("prime256v1");
	ecdh.generateKeys();
	const device = { ecdh, publicKey: ecdh.getPublicKey(), auth: randomBytes(16), id: `${key}-${randomBytes(4).toString("hex")}` };
	who[key] = { id: u.id, token, name: `${first} Pushtest`, device };
}
const call = (path, opts = {}, as = "a") =>
	fetch(BASE + path, { ...opts, redirect: "manual", headers: { "Content-Type": "application/json", ...(opts.headers ?? {}), cookie: `nibbs_session=${who[as].token}` } });
const subscription = (k) => ({
	endpoint: `https://127.0.0.1:${PORT}/dev/${who[k].device.id}`,
	keys: { p256dh: b64u(who[k].device.publicKey), auth: b64u(who[k].device.auth) },
});
const received = (k) => (inbox.get(who[k].device.id) ?? []).map((m) => decrypt(who[k].device, m.body));
const clearInbox = () => inbox.clear();
async function waitFor(pred, ms = 8000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (pred()) return true;
		await sleep(200);
	}
	return pred();
}

try {
	console.log("A. subscribe");
	const anon = await fetch(`${BASE}/api/push/subscribe`, { method: "POST", body: JSON.stringify(subscription("a")) });
	ok("subscribing needs a session", anon.status === 401, String(anon.status));
	const evil = await call("/api/push/subscribe", { method: "POST", body: JSON.stringify({ ...subscription("a"), endpoint: "https://evil.example.com/x" }) });
	ok("an endpoint that isn't a push service is refused", evil.status === 400, String(evil.status));
	for (const k of ["a", "b", "c"]) {
		const r = await call("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription(k)) }, k);
		ok(`${who[k].name}'s device registered`, r.status === 200, `${r.status} ${await r.text()}`);
	}
	const st = await (await call(`/api/push/status?endpoint=${encodeURIComponent(subscription("b").endpoint)}`, {}, "b")).json();
	ok("status: server enabled and this device registered", st.enabled === true && st.registered === true, JSON.stringify(st));
	const test = await (await call("/api/push/test", { method: "POST" }, "b")).json();
	await waitFor(() => received("b").length >= 1);
	ok("a test push reaches the device and decrypts", test.ok && received("b")[0]?.title === "Notifications are on", JSON.stringify(test));
	clearInbox();

	console.log("\nB. team alerts on sign-in / sign-out");
	const lagosNow = new Date(Date.now() + 3600_000);
	const mod = lagosNow.getUTCHours() * 60 + lagosNow.getUTCMinutes();
	const dow = lagosNow.getUTCDay();
	const pmOpen = dow === 0 || dow === 6 ? 840 : 720;
	const live = mod >= pmOpen && mod < 1200 ? "afternoon" : mod >= 1200 || mod < 480 ? "night" : null;
	if (!live) {
		console.log("  – skipped: no shift open right now (08:00 to the afternoon open). Run again during a shift.");
	} else {
		const si = await (await call(`/api/attendance/sign-in?shift=${live}`, { method: "POST" }, "a")).json();
		ok(`${who.a.name} signs in for the ${live}`, si.ok && si.created, JSON.stringify(si));
		await waitFor(() => received("b").length >= 1 && received("c").length >= 1);
		await sleep(800);
		const [b] = received("b");
		ok("everyone else gets it once", received("b").length === 1 && received("c").length === 1, `${received("b").length}/${received("c").length}`);
		ok("the person who signed in doesn't", received("a").length === 0, String(received("a").length));
		ok("it says who and what", b?.title === "Ada Pushtest signed in" && new RegExp(`^${live === "night" ? "Night" : "Afternoon"} duty, .+ at \\d\\d:\\d\\d\\.$`).test(b?.body ?? ""), JSON.stringify(b));
		ok("tapping it opens that shift's register", b?.url === `/attendance?shift=${live}`, b?.url);
		const urgency = inbox.get(who.b.device.id)?.[0]?.headers.urgency;
		ok("sent as high urgency with a TTL", urgency === "high" && Number(inbox.get(who.b.device.id)?.[0]?.headers.ttl) === 3600, String(urgency));
		clearInbox();
		const again = await (await call(`/api/attendance/sign-in?shift=${live}`, { method: "POST" }, "a")).json();
		await sleep(2500);
		ok("a repeat tap changes nothing and alerts nobody", again.ok && !again.created && received("b").length === 0, JSON.stringify(again));
		const so = await (await call(`/api/attendance/sign-out?shift=${live}`, { method: "POST" }, "a")).json();
		await waitFor(() => received("b").length >= 1);
		ok("signing out alerts the team too", so.ok && received("b")[0]?.title === "Ada Pushtest signed out", JSON.stringify(received("b")[0]));
		ok("...replacing the sign-in alert on screen (same tag)", received("b")[0]?.tag === b?.tag);
		clearInbox();
	}

	console.log("\nC. reminders (cron)");
	const users = [who.a.id, who.b.id, who.c.id].join(",");
	const cron = (at, auth = `Bearer ${SECRET}`) =>
		fetch(`${BASE}/api/cron/shift-reminders?at=${encodeURIComponent(at)}&users=${users}`, { headers: { authorization: auth } });
	ok("no secret → 401", (await fetch(`${BASE}/api/cron/shift-reminders`)).status === 401);
	ok("wrong secret → 401", (await cron("2020-01-06T11:00:00Z", "Bearer nope")).status === 401);

	// Monday 6 Jan 2020: afternoon opens 12:00 Lagos = 11:00Z.
	const open = await (await cron("2020-01-06T11:02:00Z")).json();
	await waitFor(() => ["a", "b", "c"].every((k) => received(k).length >= 1));
	ok("at the open: a sign-in reminder for each of the 3", open.ok && open.due === 3 && open.sent === 3, JSON.stringify(open));
	const r = received("b")[0];
	ok("...titled, with the hours and a 'Not on duty today' button", r?.title === "Afternoon duty has started" && /12:00–20:00/.test(r?.body ?? "") && r?.actions?.some((x) => x.action === "not-on-duty"), JSON.stringify(r));
	ok("...carrying the shift and date for that button", r?.data?.shift === "afternoon" && r?.data?.date === "2020-01-06", JSON.stringify(r?.data));
	clearInbox();
	const twice = await (await cron("2020-01-06T11:07:00Z")).json();
	await sleep(1000);
	ok("the next tick sends nothing new", twice.due === 0 && twice.sent === 0 && inbox.size === 0, JSON.stringify(twice));

	const nod = await call("/api/push/not-on-duty", { method: "POST", body: JSON.stringify({ shift: "afternoon", date: "2020-01-06" }) }, "a");
	ok("'Not on duty today' is saved", nod.status === 200);
	const follow = await (await cron("2020-01-06T12:01:00Z")).json();
	await waitFor(() => received("b").length >= 1 && received("c").length >= 1);
	ok("follow-up nudge an hour later, but not to the one not on duty", follow.due === 2 && received("a").length === 0 && received("b")[0]?.title === "Still not signed in for this afternoon", JSON.stringify(follow));
	clearInbox();

	// Bola worked that afternoon and never signed out.
	const add = await call("/api/attendance/entries", { method: "POST", body: JSON.stringify({ userId: who.b.id, nightDate: "2020-01-06", shift: "afternoon", signedIn: "12:05" }) }, "c");
	ok("(admin records Bola's open afternoon)", add.status === 200, String(add.status));
	// 20:00 is the afternoon's close AND the night's open: Bola gets the
	// sign-out, and all three get the night sign-in reminder.
	const close = await (await cron("2020-01-06T19:00:00Z")).json();
	await waitFor(() => received("b").length >= 2 && received("c").length >= 1);
	await sleep(500);
	const titles = (k) => received(k).map((x) => x.title).sort();
	ok("at the close: only the person still signed in is told to sign out", close.due === 4 &&
		JSON.stringify(titles("b")) === JSON.stringify(["Afternoon duty has ended", "Night duty has started"]) &&
		JSON.stringify(titles("c")) === JSON.stringify(["Night duty has started"]), `${JSON.stringify(close)} b=${titles("b")} c=${titles("c")}`);
	ok("...and the night sign-in reminder goes out at the same tick", JSON.stringify(titles("a")) === JSON.stringify(["Night duty has started"]), String(titles("a")));
	clearInbox();
	const urgent = await (await cron("2020-01-06T19:21:00Z")).json();
	await waitFor(() => received("b").length >= 1);
	ok("10 minutes before it locks: an urgent one that stays on screen", urgent.due === 1 && received("b")[0]?.requireInteraction === true && /locks at 20:30/.test(received("b")[0]?.title ?? ""), JSON.stringify(received("b")[0]));
	clearInbox();

	console.log("\nD. dead devices");
	respondWith.set(who.c.device.id, 410);
	const dead = await call("/api/push/test", { method: "POST" }, "c");
	const gone = await (await call(`/api/push/status?endpoint=${encodeURIComponent(subscription("c").endpoint)}`, {}, "c")).json();
	ok("a device the push service says is gone (410) is removed", dead.status === 409 && gone.registered === false, `${dead.status} ${JSON.stringify(gone)}`);
	const del = await call("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: subscription("b").endpoint }) }, "b");
	const off = await (await call(`/api/push/status?endpoint=${encodeURIComponent(subscription("b").endpoint)}`, {}, "b")).json();
	ok("turning notifications off removes the device", del.status === 200 && off.registered === false);

	const [log] = await sql`select count(*)::int as n from nibbs_push_log where user_id = any(${[who.a.id, who.b.id, who.c.id]}) and status = 'sent'`;
	ok("every send is in the push log", log.n >= 6, String(log.n));
} finally {
	for (const k of Object.keys(who)) await sql`delete from nibbs_users where id = ${who[k].id}`;
	const [{ left }] = await sql`select count(*)::int as left from nibbs_users where email like 'zz-push-%@test.invalid'`;
	ok("test users, devices, logs and shifts cleaned up", left === 0, `${left} left`);
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
