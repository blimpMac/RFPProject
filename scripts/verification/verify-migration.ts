import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { REQUIRED_SHEETS, text } from '../migration/shared.js';

const source = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!source) throw new Error('Usage: npm run migrate:verify -- <complete-workbook.xlsx>');
if (!url || !key) throw new Error('Supabase credentials are required.');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(source));
const sourceCounts = Object.fromEntries(
  REQUIRED_SHEETS.map((name) => {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`Required worksheet is missing: ${name}`);
    const rows = Array.from({ length: sheet.rowCount }, (_, row) =>
      Array.from(
        { length: sheet.columnCount },
        (_, column) => sheet.getCell(row + 1, column + 1).value,
      ),
    );
    const count =
      name === 'Recommended Process Flow'
        ? rows.filter(
            (row, index) =>
              ![2, 9].includes(index) && row.some((value) => value !== null && value !== ''),
          ).length
        : Math.max(
            0,
            rows.filter(
              (row, index) => index === 0 || row.some((value) => value !== null && value !== ''),
            ).length - 1,
          );
    return [name, count];
  }),
);

const db = createClient(url, key, { auth: { persistSession: false } });
const targets = {
  form_responses: 'Form Responses 1',
  rfp_requests: 'RFP Tracker',
  approvers: 'Approver Master',
  approval_logs: 'Approval Log',
  process_flow_steps: 'Recommended Process Flow',
};
const targetCounts: Record<string, number> = {};
for (const [table, sheet] of Object.entries(targets)) {
  const { count, error } = await db
    .from(table)
    .select('*', { head: true, count: 'exact' })
    .eq('source_worksheet', sheet);
  if (error) throw error;
  targetCounts[sheet] = count || 0;
}
const { data: requests } = await db
  .from('rfp_requests')
  .select('rfp_number,source_row_number,raw_record')
  .eq('source_worksheet', 'RFP Tracker')
  .order('source_row_number');
const { count: unmatched } = await db
  .from('form_responses')
  .select('*', { head: true, count: 'exact' })
  .in('match_status', ['unmatched', 'ambiguous']);
const { count: migratedAttachments } = await db
  .from('request_attachments')
  .select('*', { head: true, count: 'exact' })
  .eq('status', 'available')
  .not('source_url', 'is', null);
const { count: pendingAttachments } = await db
  .from('request_attachments')
  .select('*', { head: true, count: 'exact' })
  .in('status', ['migration_pending', 'source_access_required']);
const mismatches = Object.entries(sourceCounts)
  .filter(([sheet, count]) => targetCounts[sheet] !== count)
  .map(([sheet, count]) => ({ sheet, source: count, target: targetCounts[sheet] }));
const report = {
  verifiedAt: new Date().toISOString(),
  sourceCounts,
  targetCounts,
  mismatches,
  unmatchedForms: unmatched || 0,
  historicalAttachments: { migrated: migratedAttachments || 0, pending: pendingAttachments || 0 },
  rfpNumbers: (requests || []).map((request) => text(request.rfp_number)),
};
fs.mkdirSync('migration-archive', { recursive: true });
fs.writeFileSync('migration-archive/verification-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: mismatches.length === 0, report }, null, 2));
if (mismatches.length) process.exitCode = 1;
