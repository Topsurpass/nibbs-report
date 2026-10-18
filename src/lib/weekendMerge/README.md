# Weekend Settlement merge

Page: `/weekend-settlement` (sidebar: **Weekend Settlement**). Everything runs in the browser.

Settlement sends the eTranzact `.txt` files for every weekend and holiday session.
This module merges them into one file for the next business day, then checks it
row by row against the merged file Settlement produces.

## Rules

| Rule | Behaviour |
| --- | --- |
| Source names | Exactly `ETRANZACT_<ddmmyyyy>_<1-4>.txt`. `_1`..`_4` = 8am, 11am, 2pm, 5pm. Copies like `... (1).txt` are rejected. |
| Merge | Rows are appended file after file. Nothing is summed or de-duplicated. |
| Order | Filename date, then session. Upload order never matters. |
| Date column | Rewritten to the merge date on every row. Type, code and amount are copied byte for byte. |
| Output name | `ETRANZACT_<merge ddmmyyyy>_<session>.txt`. Session defaults to `_1`. |
| Merge date | Defaults to the next Monday to Friday after the last source date. Editable. |
| Output bytes | CRLF between rows, no trailing newline (same as NIBBS's files). |

## Checks

**Per file at upload** (`sourceFile.ts`). Fail: name shape, session 1-4, real date,
record template (single tabs, `702`, `YYYY/MM/DD`, 10-digit code, `±17.2` amount, no
blank lines), in-row date = filename date, net = 0.00, mixed line endings, empty file.
Warn: LF-only endings, weekday date (confirm it's a holiday).

**Across files** (`collection.ts`). Fail: any rejected file, duplicate day/session,
a day missing any of its 4 sessions. Warn: gap between days, weekday dates.
The merge is blocked until nothing fails.

**Merged output** (`merge.ts`). Every source row carried, net = 0, template valid,
merge date after the last source date and not a weekend (warn).

**Against Settlement** (`compare.ts`). Filename, template, net = 0, row count,
CRLF, trailing newline (warn), and every row identical. Each differing row says why:
spacing, record type, date, bank code, amount, order (with the row it belongs at),
LF line ending, missing or extra row.

Amounts are summed as `BigInt` kobo, so totals are exact at any size.

## Tests and eval

- `npm test` runs the gate tests in `*.test.ts`. They use synthetic fixtures from `testFixtures.ts`.
- `npm run eval:weekend-merge [dir]` runs over the real files, by default in `~/Downloads/Nibbs Portal`. Those files are never committed. The eval covers upload checks, a real-file merge round trip, and a seeded mutation fuzz. Every kind of mutation must be caught 100% of the time.

## UI (`src/app/components/weekend-merge/`)

- **Empty state** (`UploadHero`): one large multi-file drop target that says explicitly that many files can be uploaded at once. Includes a guide to the file name format and the session numbers.
- **Session board** (`SessionFilesCard` → `SessionBoard` → `SessionSlotCard`):
  - One row per day, with four session slots each: Ready, Check, Rejected, Duplicate or Missing. A "Merge #n" label shows each file's position.
  - The whole card accepts more files, and dropping a file with the same name replaces it.
  - Layout comes from `board.ts`.
- **Merged file panel** (`MergeSummaryPanel`): output name, merge date, session, totals, readiness checklist and download. It is sticky on wide screens and sits directly under the files on narrow ones.
- **Verify** (`VerifyPanel` → `RowDiffTable`):
  - A pass or fail banner and file-level checks.
  - A Differences / All rows switch. Each row shows the expected text against Settlement's, with the differing field or separator highlighted (`diffSegments`).

## "What to fix" workbook (for the Settlement team)

On Verify, **Download .xlsx** builds `ETRANZACT_<date>_<n>_problems.xlsx` in the browser (exceljs is loaded on demand, so nothing is uploaded). It is written for settlement analysts, not developers.

- **What to fix**: a one-line verdict, then one row per problem: Line · Problem · In your file (red) · Should be (green) · Bank (name from NIBBS Settings) · Session. Problems are grouped the way a person thinks about them:
  - two swapped lines become "Swap lines 61 and 62";
  - a line left out becomes "A line is missing", not hundreds of shifted rows;
  - an added line becomes "An extra line";
  - spacing names the gap, for example "Space instead of TAB between 702 and the date";
  - the file name and an empty last line are listed too.

  Below that is the correct order of the session files, with their line ranges.
- **All lines**: every line, with our date and amount next to theirs. Wrong cells are red, and a grey bar marks where each session file starts.

Grouping compares line content, not reason text: real files repeat identical lines, so "belongs at row N" can point at any copy. Line endings (LF vs CRLF) are treated as equivalent everywhere.

Code: `discrepancyReport.ts` (`findProblems` and the sheet model, tested) and `discrepancyExcel.ts` (exceljs painter, round-trip tested). `eval:weekend-merge` requires each single planted error to come out as exactly one problem that covers every flagged line.

## Nigerian public holidays

Weekday files dated on a Nigerian public holiday are recognised automatically. Fri 12 Jun 2026, for example, shows "Public holiday · Democracy Day" instead of the "Weekday · public holiday?" warning, and the "Only weekends / holidays" check passes for it. The list comes from Google Calendar's public **Holidays in Nigeria** feed (no key or account needed):

- `src/lib/holidays/parseIcs.ts` parses the iCal feed and keeps **public holidays only** (Google's "Observance" entries such as Valentine's Day are dropped). Lunar holidays not yet announced are marked tentative.
- `src/services/holidays/googleCalendar.ts` fetches the feed server-side and caches it for 12h, keeping the last good copy if Google is down. The route is `GET /api/holidays`. Only this public list crosses the network; settlement files never do.
- `applyHolidays` and `assessCollection({ holidays })` apply the calendar when files are assessed, so files dropped before the calendar loads are recognised once it arrives.
- If the calendar can't be loaded, weekdays fall back to the old warning, with a note under the board.
- `npm run eval:holidays` checks the live feed. It skips when offline.

The default merge date and the afternoon-duty hours are not affected by holidays.
