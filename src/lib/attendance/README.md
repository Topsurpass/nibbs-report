# Duty attendance (night and afternoon)

Page: `/attendance` (sidebar: **Duty Register**). An analyst signs in when their
shift starts and signs out when it ends. There are two shifts:

| Shift | Hours (Africa/Lagos) | Key |
|---|---|---|
| Night | 20:30 → 08:30 every day | the date the night started |
| Afternoon | 12:30 → 20:30 Mon-Fri, 14:30 → 20:30 Sat-Sun | its own date |

Weekday public holidays use weekday afternoon hours. Both shifts have the same
30-minute sign-out grace. `shifts.ts` owns the afternoon rules and wraps
`nightWindow.ts` (unchanged) so every caller uses one shift-aware API; routes
take `?shift=night|afternoon` and default to night, so older clients keep
working. Rows live in the same table with a `shift` column; the register,
calendar, per-analyst counts ("Afternoons" per person), Excel and JPEG are all
per shift.

### Migration (expand / contract)

`npm run db:push` adds the `shift` column (existing rows become nights) and a
unique index on `(user_id, night_date, shift)`. The legacy `(user_id,
night_date)` constraint stays until the new code is deployed, because older
deployed code still writes `on conflict (user_id, night_date)`. After deploy,
run `npm run db:contract-afternoon` once to drop it. Until then one analyst
cannot hold a night and an afternoon on the same date.

### Reminder pop-up

Analysts often forget to sign in or out, so `ShiftReminder` (mounted in the app shell) shows a pop-up on any page except the Duty Register:

- **Sign in:** a shift is open and they have no entry for it. Buttons: *Sign in now* · *Remind me in 30 min* · *Not on duty today*. "Not on duty" silences that shift for that day only.
- **Sign out:** they're signed in and the shift ends within 30 minutes ("ends at 20:30"), or it has ended and the 30-minute grace is running. The grace version is urgent and shows a live countdown to the lock. A sign-out reminder beats a sign-in one.
- Closing the pop-up counts as "remind me later". It waits while another dialog (for example a first-visit tour) is open.

The rules are pure and tested in `reminders.ts` (`decideReminder`, built on `shifts.ts`). Dismissals are kept per user and per browser in `localStorage` (`nibbs:shift-reminders:<userId>`) and pruned after two days. Sign-in and sign-out go through `postShiftAction`, the same helper the register's card uses.

The rest of this document describes the night rules, which apply unchanged.

---

An analyst signs in when their night shift starts and signs out when it ends.
The register shows each analyst their own months; an admin sees the whole team,
can correct a night, and can download the month as Excel or as a JPEG.

## The one rule everything else follows

A **night** is keyed by the Africa/Lagos date the shift *started*.

```
        20:30              00:00              08:30            20:30
  ────────┼──────────────────┼──────────────────┼────────────────┼────────
          │◀────────── night of the 4th ───────▶│    closed      │ 5th…
       4 Sep                                  5 Sep
```

So a sign-in at 02:00 on the 5th belongs to the night of the **4th**, and shows
on the 4th in the calendar. Using a raw timestamp date as the key would split
one shift across two days and halve everybody's night count.

| | |
|---|---|
| Sign-in window | 20:30 → 08:30 Africa/Lagos |
| Sign-out grace | 30 minutes past the close (until 09:00) |
| One row per | analyst per night, enforced by a unique constraint |
| Missing sign-out | hours are **unknown**, never zero |

`nightWindow.ts` owns every one of these decisions and is the only place they are
computed. It is pure and dependency-free so the browser (which decides whether to
enable the button) and the route handler (which decides whether to accept the
write) run the identical rule. Drift between the two would show up as "the button
was there but the save was rejected".

Nigeria has observed no daylight saving since 1980, so Lagos is a fixed UTC+01:00
and the module needs no tzdata. `LAGOS_OFFSET_MINUTES` is the single constant to
change if that ever stops being true.

## Layout

| File | Does |
|---|---|
| `nightWindow.ts` | Window, night keys, durations, calendar grid, formatting. Pure. |
| `shifts.ts` | Afternoon window + one shift-aware API over both shifts. Pure. |
| `reminders.ts` | When to show the sign-in / sign-out reminder pop-up. Pure. |
| `summary.ts` | Per-analyst roll-ups over a month. Pure. |
| `exportAttendance.ts` | Content model for the workbook and the JPEG. Pure. |
| `excel.ts` | exceljs painter. Server only — decides looks, never content. |
| `types.ts` | Wire shapes. |
| `../paginate.ts` | Generic page clamping. Pure, and not attendance-specific. |
| `../../services/attendance/repository.ts` | Rows in, rows out. No clock logic. |
| `../../services/attendance/service.ts` | Scope rule: analysts see themselves. |
| `../../app/components/attendance/paintSummary.ts` | Canvas JPEG painter. |

The workbook, the JPEG and the on-screen totals all read `summarizeMonth`, so the
three cannot report different numbers. They differ only in who they *list*: the
on-screen table is a roster view and keeps the zero-night rows (a name with 0 is
the answer to "who has not done a night yet"), while both downloads run
`withNights` first, because a file that gets attached to a mail is the record of
who was on duty. The totals row keeps the roster denominator — `3 of 11 signed
in` — so a reader can still see that somebody is missing.

The Every-night list pages by **night**, never by row, so a night worked by six
analysts is never split across a page break. On the team register those analysts
are grouped under their night (`groupNights`), because the question that view
answers is "how many were on last night" and a flat list makes it a counting
exercise.

## Gotchas worth knowing before you change anything

- **`night_date` is read with `to_char`.** A Postgres `date` deserialised into a
  JS `Date` lands at UTC midnight and renders as the *previous* day once a local
  offset is applied. The key must survive the round trip byte for byte.
- **The server never trusts a client-supplied night.** `/sign-in` computes it
  from the server clock, so a wrong device clock cannot book a night that was not
  worked.
- **Sign-out uses `signOutNightFor`, not `nightDateFor`.** During the grace the
  sign-in window is already shut but the finished night must still be closeable.
- **`instantForNight` splits at 20:30.** Within a night, `21:00` means that
  evening and `08:00` means the next morning. This is what makes an admin typing
  a time get the right calendar date.
- **A signed-out night is locked to the analyst.** `signOut` only updates rows
  `where signed_out_at is null`, so the database refuses the second write; the
  route turns that into an explicit 409 rather than a no-op reported as success,
  since a stale tab replaying a request must not look like it changed something.
  Admins are unaffected — they correct nights through `/api/attendance/entries`.
- **Removing a night is a hard delete.** There is no soft-delete column, so the
  UI asks first and names the analyst and the night in the confirm. The route
  answers `{ ok: true, removed: false }` when the row was already gone, which is
  a no-op and not an error: two admins clicking Remove on the same row must not
  produce a failure.
- **Open nights contribute no hours.** Counting them as zero would quietly
  understate somebody's month; they are reported separately as "still open".

## Testing

```bash
npm test                  # gate: pure clock/roll-up/export logic, no I/O
npm run dev               # then, in another terminal:
npm run eval:attendance   # end-to-end: real routes, real DB, real cookies
```

The gate tests cover the maths in isolation. The eval covers the seams they
cannot reach — the `date` round trip, authorisation actually being enforced on
the route rather than only in the UI, and the workbook's totals row agreeing with
its own body. It seeds a throwaway analyst and admin, then deletes both.

Which sign-in branch the eval takes depends on the wall clock: inside the window
it verifies the accept path, outside it verifies the refusal. Run it once at night
and once in the day to cover both.
