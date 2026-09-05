# Night-duty attendance

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
| `summary.ts` | Per-analyst roll-ups over a month. Pure. |
| `exportAttendance.ts` | Content model for the workbook and the JPEG. Pure. |
| `excel.ts` | exceljs painter. Server only — decides looks, never content. |
| `types.ts` | Wire shapes. |
| `../paginate.ts` | Generic page clamping. Pure, and not attendance-specific. |
| `../../services/attendance/repository.ts` | Rows in, rows out. No clock logic. |
| `../../services/attendance/service.ts` | Scope rule: analysts see themselves. |
| `../../app/components/attendance/paintSummary.ts` | Canvas JPEG painter. |

The workbook, the JPEG and the on-screen totals all read `summarizeMonth`, so the
three cannot report different numbers.

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
