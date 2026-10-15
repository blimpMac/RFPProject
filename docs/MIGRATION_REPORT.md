# Migration verification report

Status: **Structured migration complete and verified against the production Supabase project.**

Source workbook: `RFP Request Form (Responses)`  
Source ID: `1MS8PhbPQA_XbULWAefow4bMsP3s7z-KEp0K9YMJHvTE`  
Inspection date: 2026-10-14 (Asia/Manila)

| Worksheet | Populated source records | Imported rows | Status |
|---|---:|---:|---|
| Form Responses 1 | 5 | 5 | Complete; 4 deterministic matches and 1 unmatched response |
| RFP Tracker | 4 | 4 | Complete |
| Approver Master | 8 | 8 | Complete |
| Approval Log | 7 | 7 | Complete |
| Recommended Process Flow | 10 structured records (12 populated rows including 2 section headings) | 10 | Complete; 256 A1:P16 positional cells preserved |

## Reconciliation baseline

- Original RFP range: `RFP-0001`–`RFP-0004`
- Required next sequence: `RFP-0005`
- Historical tracker attachment references: 4
- Additional unmatched form attachment reference: 1 (retained in the form response record)
- Historical files successfully copied to Supabase Storage: **0**
- Historical files inaccessible or pending: **4 tracker references**; all four return Drive `404 file not found` for the connected account. The additional unmatched form attachment reference remains preserved in its source record.
- Duplicate source rows: none; the completed import is protected by source checksum and row hashes.
- Approved/rejected history: one finance-approved request and two department-approved log events were observed; the importer preserves the source values/dates verbatim.

## Completion evidence

Both commands succeeded against project `chchtjolsnlelgxbgkip` on 2026-10-15 (Asia/Manila):

```powershell
npm run migrate:verify -- "C:\secure\complete-workbook.xlsx"
npm run db:test
```

The generated `migration-archive/verification-report.json` is the detailed reconciliation artifact and is intentionally excluded from Git because it may contain source identifiers.
