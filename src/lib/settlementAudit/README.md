# Settlement Audit review ("What to fix")

`review.ts` turns an audit into a short list of fixes for the Settlement team, shown on the Settlement Audit page (`AuditFixList`) and downloadable as `ETRANZACT_<ddmmyyyy>_<n>_review.xlsx`.

- **Reference:** the Frame HTML. Where it and the eTranzact .txt disagree, the .txt is what gets fixed.
- **Not included:** collateral breaches. They are escalation, not a mistake in Settlement's files.
- **One slip, one problem:** lines are read tolerantly, so a space where a TAB belongs is a spacing fix, not also "bank missing". A mistyped bank code is matched to the missing Frame bank by amount.

| Problem | Where | Should be |
|---|---|---|
| Wrong file name (date or session vs the Frame letter) | File name | the right name |
| Frame report does not balance | Frame report | 0.00, re-export |
| Spacing or field format | Line N | the rebuilt line with [TAB] markers |
| Wrong date | Line N (or every line) | report date |
| Amount differs from Frame | Line N | the Frame amount in eTranzact format |
| Wrong / unknown bank code | Line N | the matching code, or "check" |
| Bank not in the Frame report, or listed twice | Line N | remove / one line |
| Frame bank missing (non-zero) | Not in your file | `Add: 702 [TAB] …` |

The audit only *warns* when a bank is missing from the .txt. The review still lists it, because the Frame report is the reference.

The workbook model and the exceljs painter are shared with Weekend Settlement (`src/lib/reviewWorkbook/`).

Tests: `review.test.ts`. Eval: `npm run eval:settlement-review` runs the real `ETRANZACT_*.txt` corpus. Each clean file must give zero problems. Then 700 seeded single mutations (amount, spacing, date, code, dropped line, repeated line, file name) must each give exactly one problem at the right line, and every failing audit check must have a fix listed.
