# Historical workbook migration

The importer expects one unmodified `.xlsx` containing these exact worksheets:

1. `Form Responses 1`
2. `RFP Tracker`
3. `Approver Master`
4. `Approval Log`
5. `Recommended Process Flow`

Do not split the workbook or rearrange columns.

## 1. Export safely

Download the Google workbook as Microsoft Excel (`.xlsx`) with an account that can read every tab. Put it anywhere locally; `.gitignore` excludes spreadsheets and `migration-archive/`. Never place the exported company data in Git.

## 2. Apply the target schema

Configure the variables in [ENVIRONMENT.md](ENVIRONMENT.md), then run:

```powershell
npm run db:setup
```

This pushes all migrations, including the private `rfp-attachments` bucket and RLS policies.

## 3. Import all five sheets

```powershell
npm run migrate:workbook -- "C:\secure\RFP Request Form (Responses).xlsx"
```

Before inserting target records, the command:

- copies the untouched workbook into ignored `migration-archive/`;
- stores immutable row snapshots in `migration_source_snapshots`;
- stores every cell A1:P16, including blank positions, for the current process-flow source range;
- records `migration_batches` and `migration_row_maps`;
- hashes every source row so repeated execution does not duplicate it;
- imports historical identifiers and synchronizes the PostgreSQL sequence;
- matches form responses only by exact timestamp + requestor email + amount + attachment reference;
- marks nonmatches/ambiguities for Administrator review instead of guessing.

## 4. Transfer historical documents

Authorize Drive read access through `GOOGLE_DRIVE_ACCESS_TOKEN` or `GOOGLE_SERVICE_ACCOUNT_JSON`, then run:

```powershell
npm run migrate:attachments
```

The tool retrieves metadata and bytes, validates the MIME type, uploads into the private bucket, then and only then marks the row `available`. Failed/inaccessible files retain their original URL and remain `migration_pending` or `source_access_required`.

## 5. Verify

```powershell
npm run migrate:verify -- "C:\secure\RFP Request Form (Responses).xlsx"
npm run db:test
```

The verifier compares worksheet counts to target rows, lists original RFP numbers, counts unmatched forms and historical attachments, and writes a machine-readable ignored report to `migration-archive/verification-report.json`.

The committed [MIGRATION_REPORT.md](MIGRATION_REPORT.md) records the completed reconciliation and remaining attachment-access exception.
