// Live check of the Nigerian public holiday feed (Google Calendar).
//
// The gate tests parse a fixture; this fetches the real feed and asserts the
// holidays the settlement team relies on are there, and that Google's
// "Observance" entries (Valentine's Day, Father's Day…) never leak in.
//
//   npm run eval:holidays
//
// Skips (exit 0) when offline, so it never blocks work without internet.

const { parseHolidayIcs } = await import("../src/lib/holidays/parseIcs.ts");
const URL_ICS =
	"https://calendar.google.com/calendar/ical/en.ng%23holiday%40group.v.calendar.google.com/public/basic.ics";

let text;
try {
	const res = await fetch(URL_ICS, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	text = await res.text();
} catch (err) {
	console.log(`– skipped: Google Calendar unreachable (${err.message})`);
	process.exit(0);
}

let failures = 0;
const check = (ok, good, bad) => {
	if (ok) console.log(`  ✓ ${good}`);
	else {
		failures++;
		console.error(`  ✗ ${bad}`);
	}
};

const list = parseHolidayIcs(text);
const byDate = new Map(list.map((h) => [h.date, h]));
console.log(`Feed: ${list.length} public holidays\n`);

const MUST = [
	["2026-01-01", /New Year/],
	["2026-04-03", /Good Friday/],
	["2026-04-06", /Easter Monday/],
	["2026-05-01", /Workers/],
	["2026-06-12", /Democracy Day/],
	["2026-10-01", /National Day|Independence/],
	["2026-12-25", /Christmas/],
	["2026-12-26", /Boxing/],
];
for (const [date, name] of MUST) {
	const h = byDate.get(date);
	check(h && name.test(h.name), `${date} ${h?.name}`, `${date} expected ${name}, got ${h?.name ?? "nothing"}`);
}

const leaked = list.filter((h) => /valentine|father|mother|women|children|halloween|ash wednesday|easter sunday|holy saturday|ramadan start|new year's eve|christmas eve/i.test(h.name));
check(leaked.length === 0, "no observances included", `observances leaked: ${leaked.map((h) => h.name).join(", ")}`);
check(list.every((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.name.length > 0), "every holiday has a date and a name", "malformed entries");
check(list.every((h) => !/\(tentative\)/i.test(h.name)), "tentative markers stripped from names", "(tentative) left in a name");

console.log(failures === 0 ? "\nHoliday feed OK." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
