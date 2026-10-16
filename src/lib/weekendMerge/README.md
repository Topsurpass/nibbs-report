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
