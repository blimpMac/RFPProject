# Migration verification report

Status: **Source inspected; live Supabase migration not run (credentials unavailable).**

Source workbook: `RFP Request Form (Responses)`  
Source ID: `1MS8PhbPQA_XbULWAefow4bMsP3s7z-KEp0K9YMJHvTE`  
Inspection date: 2026-10-14 (Asia/Manila)

| Worksheet | Populated source records | Imported rows | Status |
|---|---:|---:|---|
| Form Responses 1 | 5 | Not run | Ready; expected 4 deterministic matches and 1 unmatched response |
| RFP Tracker | 4 | Not run | Ready |
| Approver Master | 8 | Not run | Ready |
| Approval Log | 7 | Not run | Ready |
| Recommended Process Flow | 10 structured records (12 populated rows including 2 section headings) | Not run | Ready; A1:P16 positional snapshot supported |

## Reconciliation baseline

- Original RFP range: `RFP-0001`–`RFP-0004`
- Required next sequence: `RFP-0005`
- Historical tracker attachment references: 4
- Additional unmatched form attachment reference: 1 (retained in the form response record)
- Historical files successfully copied to Supabase Storage: **0 — not attempted without Supabase/Drive authorization**
- Historical files inaccessible or pending: **4 tracker references plus 1 unmatched form reference pending authorization/verification**
- Duplicate source rows: not detected during the authenticated read; the importer will verify by row hash.
- Approved/rejected history: one finance-approved request and two department-approved log events were observed; the importer preserves the source values/dates verbatim.

## Completion gate

This report must not be changed to “complete” until both commands succeed against the authorized project:

```powershell
npm run migrate:verify -- "C:\secure\complete-workbook.xlsx"
npm run db:test
```

The generated `migration-archive/verification-report.json` is the detailed reconciliation artifact and is intentionally excluded from Git because it may contain source identifiers.
