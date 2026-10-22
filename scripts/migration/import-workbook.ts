import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import {
  a1,
  hashRecord,
  normalize,
  nullable,
  parseDate,
  REQUIRED_SHEETS,
  rfpNumeric,
  text,
} from './shared.js';

const source = process.argv[2];
if (!source) throw new Error('Usage: npm run migrate:workbook -- <complete-workbook.xlsx>');
const supabaseUrl = process.env.SUPABASE_URL,
  serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey)
  throw new Error(
    'SUPABASE_URL and SUPABASE_SECRET_KEY are required (legacy SUPABASE_SERVICE_ROLE_KEY is accepted).',
  );
const absolute = path.resolve(source);
if (!fs.existsSync(absolute)) throw new Error(`Workbook not found: ${absolute}`);
const file = fs.readFileSync(absolute);
const checksum = hashRecord([...file]);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(absolute);
for (const name of REQUIRED_SHEETS)
  if (!workbook.getWorksheet(name)) throw new Error(`Required worksheet is missing: ${name}`);
const archiveDir = path.resolve('migration-archive');
fs.mkdirSync(archiveDir, { recursive: true });
const backup = path.join(
  archiveDir,
  `${new Date().toISOString().replaceAll(':', '-')}-${path.basename(absolute)}`,
);
fs.copyFileSync(absolute, backup);
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const existing = await db
  .from('migration_batches')
  .select('id,status,summary')
  .eq('source_checksum', checksum)
  .maybeSingle();
if (existing.error) throw existing.error;
if (existing.data?.status?.startsWith('completed')) {
  console.log(
    JSON.stringify(
      { ok: true, duplicate: true, batchId: existing.data.id, summary: existing.data.summary },
      null,
      2,
    ),
  );
  process.exit(0);
}
let batchId = existing.data?.id;
const sourceCounts: Record<string, number> = {};
function valueOf(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'result' in value) return value.result ?? null;
  if (typeof value === 'object' && 'richText' in value)
    return value.richText.map((part) => part.text).join('');
  if (typeof value === 'object' && 'text' in value) return value.text;
  return value;
}
const matrices = new Map<string, unknown[][]>();
for (const name of REQUIRED_SHEETS) {
  const sheet = workbook.getWorksheet(name)!;
  const matrix = Array.from({ length: sheet.rowCount }, (_, row) =>
    Array.from({ length: sheet.columnCount }, (_, column) =>
      valueOf(sheet.getCell(row + 1, column + 1).value),
    ),
  );
  matrices.set(name, matrix);
  sourceCounts[name] =
    name === 'Recommended Process Flow'
      ? matrix.filter((row, i) => ![2, 9].includes(i) && row.some((v) => v !== null && v !== ''))
          .length
      : Math.max(
          0,
          matrix.filter((row, i) => i === 0 || row.some((v) => v !== null && v !== '')).length - 1,
        );
}
if (!batchId) {
  const created = await db
    .from('migration_batches')
    .insert({
      source_name: path.basename(absolute),
      source_file_id: process.env.GOOGLE_SHEET_ID || null,
      source_checksum: checksum,
      source_counts: sourceCounts,
    })
    .select('id')
    .single();
  if (created.error) throw created.error;
  batchId = created.data.id;
}
const counts: Record<string, number> = {},
  skipped: Record<string, number> = {},
  warnings: string[] = [];
async function snapshot(name: string, matrix: unknown[][]) {
  const records = matrix.map((cells, row) => ({
    batch_id: batchId,
    worksheet_name: name,
    source_row_number: row + 1,
    source_record_hash: hashRecord(cells),
    raw_cells: cells,
  }));
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await db
      .from('migration_source_snapshots')
      .upsert(records.slice(i, i + 500), {
        onConflict: 'batch_id,worksheet_name,source_row_number',
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
}
for (const [name, matrix] of matrices) await snapshot(name, matrix);
async function mapRow(
  sheet: string,
  row: number,
  hash: string,
  targetTable: string | undefined,
  targetId: string | undefined,
  result: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await db.from('migration_row_maps').upsert(
    {
      batch_id: batchId,
      worksheet_name: sheet,
      source_row_number: row,
      source_record_hash: hash,
      target_table: targetTable,
      target_id: targetId,
      result,
      details,
    },
    { onConflict: 'worksheet_name,source_row_number,source_record_hash', ignoreDuplicates: true },
  );
  if (error) throw error;
}
try {
  const approverRows = matrices
    .get('Approver Master')!
    .slice(1)
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => r.some((v) => v));
  for (const { r, row } of approverRows) {
    const hash = hashRecord(r);
    const payload = {
      department: text(r[0]),
      approver_name: text(r[1]),
      approver_email: text(r[2]).toLowerCase(),
      active: /^(yes|true|active|1)$/i.test(text(r[3])),
      source_worksheet: 'Approver Master',
      source_row_number: row,
      import_batch_id: batchId,
    };
    const found = await db
      .from('approvers')
      .select('id')
      .eq('normalized_department', normalize(r[0]))
      .eq('approver_email', payload.approver_email)
      .maybeSingle();
    let id = found.data?.id;
    if (!id) {
      const inserted = await db.from('approvers').insert(payload).select('id').single();
      if (inserted.error) throw inserted.error;
      id = inserted.data.id;
      counts.approvers = (counts.approvers || 0) + 1;
    } else skipped.approvers = (skipped.approvers || 0) + 1;
    await mapRow(
      'Approver Master',
      row,
      hash,
      'approvers',
      id,
      found.data ? 'duplicate' : 'imported',
    );
  }
  const { data: approvers } = await db
    .from('approvers')
    .select('id,normalized_department,approver_email');
  const trackerRows = matrices
    .get('RFP Tracker')!
    .slice(1)
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => text(r[0]));
  for (const { r, row } of trackerRows) {
    const hash = hashRecord(r),
      department = text(r[4]),
      approver = approvers?.find((a) => a.normalized_department === normalize(department));
    const payload = {
      rfp_number: text(r[0]),
      submitted_at: parseDate(r[1]),
      requestor_email: text(r[2]).toLowerCase(),
      requestor_name: text(r[3]),
      department,
      normalized_department: normalize(department),
      project_class: text(r[5]),
      rfp_type: text(r[6]),
      normalized_rfp_type: normalize(r[6]),
      supplier_payee: text(r[7]),
      purpose_description: text(r[8]),
      amount: Number(String(r[9]).replace(/[^0-9.-]/g, '')),
      required_payment_date: parseDate(r[10], true),
      supporting_documents_source: nullable(r[11]),
      approving_head: text(r[12]),
      approver_id: approver?.id || null,
      approver_email: text(r[13]).toLowerCase(),
      department_approval: text(r[14]) || 'Pending',
      department_approval_at: parseDate(r[15]),
      department_approval_remarks: nullable(r[16]),
      finance_review: text(r[17]) || 'Not Started',
      finance_review_at: parseDate(r[18]),
      finance_remarks: nullable(r[19]),
      final_status: text(r[20]),
      last_action: text(r[21]),
      planned_check_date: parseDate(r[22], true),
      check_date_last_updated: parseDate(r[23]),
      check_date_change_reason: nullable(r[24]),
      finance_email_thread_id: nullable(r[25]),
      source_worksheet: 'RFP Tracker',
      source_row_number: row,
      source_record_hash: hash,
      import_batch_id: batchId,
      raw_record: Object.fromEntries(
        (matrices.get('RFP Tracker')![0] || []).map((h, i) => [text(h), r[i] ?? null]),
      ),
    };
    const found = await db
      .from('rfp_requests')
      .select('id')
      .eq('rfp_number', payload.rfp_number)
      .maybeSingle();
    let id = found.data?.id;
    if (!id) {
      const inserted = await db.from('rfp_requests').insert(payload).select('id').single();
      if (inserted.error) throw inserted.error;
      id = inserted.data.id;
      counts.rfp_requests = (counts.rfp_requests || 0) + 1;
    } else skipped.rfp_requests = (skipped.rfp_requests || 0) + 1;
    await mapRow(
      'RFP Tracker',
      row,
      hash,
      'rfp_requests',
      id,
      found.data ? 'duplicate' : 'imported',
    );
    if (payload.supporting_documents_source) {
      const urls = payload.supporting_documents_source
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const url of urls) {
        const fileId = url.match(/[?&]id=([^&]+)/)?.[1] || url.match(/\/d\/([^/]+)/)?.[1];
        const exists = await db
          .from('request_attachments')
          .select('id')
          .eq('request_id', id)
          .eq('source_url', url)
          .maybeSingle();
        if (!exists.data)
          await db.from('request_attachments').insert({
            request_id: id,
            original_filename: fileId
              ? `Google Drive file ${fileId.slice(0, 8)}`
              : 'Historical attachment',
            status: 'source_access_required',
            source_url: url,
            source_file_id: fileId || null,
          });
      }
    }
  }
  await db.rpc('sync_rfp_number_sequence');
  const { data: requests } = await db
    .from('rfp_requests')
    .select('id,rfp_number,submitted_at,requestor_email,amount,supporting_documents_source');
  const byNumber = new Map((requests || []).map((r) => [r.rfp_number, r]));
  const formRows = matrices
    .get('Form Responses 1')!
    .slice(1)
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => r.some((v) => v));
  for (const { r, row } of formRows) {
    const hash = hashRecord(r),
      timestamp = parseDate(r[0]);
    const candidates = (requests || []).filter(
      (q) =>
        q.requestor_email === text(r[1]).toLowerCase() &&
        Number(q.amount) === Number(r[8]) &&
        q.supporting_documents_source === nullable(r[10]) &&
        q.submitted_at &&
        timestamp &&
        Math.abs(new Date(q.submitted_at).getTime() - new Date(timestamp).getTime()) < 1000,
    );
    const match = candidates.length === 1 ? candidates[0] : undefined;
    const status =
      candidates.length === 1 ? 'matched' : candidates.length > 1 ? 'ambiguous' : 'unmatched';
    const payload = {
      source_timestamp: timestamp,
      requestor_email: text(r[1]).toLowerCase(),
      requestor_name: text(r[2]),
      department: text(r[3]),
      normalized_department: normalize(r[3]),
      project_class: text(r[4]),
      rfp_type: text(r[5]),
      normalized_rfp_type: normalize(r[5]),
      supplier_payee: text(r[6]),
      purpose_description: text(r[7]),
      amount: Number(r[8]),
      required_payment_date: parseDate(r[9], true),
      supporting_documents: nullable(r[10]),
      approving_head: text(r[11]),
      matched_request_id: match?.id || null,
      match_status: status,
      match_method: match ? 'exact timestamp+email+amount+attachment' : null,
      source_worksheet: 'Form Responses 1',
      source_row_number: row,
      source_record_hash: hash,
      import_batch_id: batchId,
      raw_record: Object.fromEntries(
        (matrices.get('Form Responses 1')![0] || []).map((h, i) => [text(h), r[i] ?? null]),
      ),
    };
    const inserted = await db
      .from('form_responses')
      .upsert(payload, {
        onConflict: 'source_worksheet,source_row_number,source_record_hash',
        ignoreDuplicates: true,
      })
      .select('id')
      .maybeSingle();
    if (inserted.error) throw inserted.error;
    counts.form_responses = (counts.form_responses || 0) + (inserted.data ? 1 : 0);
    if (!inserted.data) skipped.form_responses = (skipped.form_responses || 0) + 1;
    await mapRow(
      'Form Responses 1',
      row,
      hash,
      'form_responses',
      inserted.data?.id,
      inserted.data ? (status === 'matched' ? 'matched' : 'unmatched') : 'duplicate',
      { matchStatus: status, candidates: candidates.length },
    );
    if (status !== 'matched') warnings.push(`Form Responses 1 row ${row}: ${status}`);
  }
  const logRows = matrices
    .get('Approval Log')!
    .slice(1)
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => text(r[1]));
  for (const { r, row } of logRows) {
    const hash = hashRecord(r),
      req = byNumber.get(text(r[1]));
    const payload = {
      request_id: req?.id || null,
      rfp_number: text(r[1]),
      occurred_at: parseDate(r[0]),
      action: text(r[2]),
      actor_email: nullable(r[3]),
      remarks: nullable(r[4]),
      previous_status: nullable(r[5]),
      new_status: nullable(r[6]),
      source_worksheet: 'Approval Log',
      source_row_number: row,
      source_record_hash: hash,
      import_batch_id: batchId,
      raw_record: Object.fromEntries(
        (matrices.get('Approval Log')![0] || []).map((h, i) => [text(h), r[i] ?? null]),
      ),
    };
    const inserted = await db
      .from('approval_logs')
      .upsert(payload, {
        onConflict: 'source_worksheet,source_row_number,source_record_hash',
        ignoreDuplicates: true,
      })
      .select('id')
      .maybeSingle();
    if (inserted.error) throw inserted.error;
    counts.approval_logs = (counts.approval_logs || 0) + (inserted.data ? 1 : 0);
    await mapRow(
      'Approval Log',
      row,
      hash,
      'approval_logs',
      inserted.data?.id,
      inserted.data ? 'imported' : 'duplicate',
    );
  }
  const flow = matrices.get('Recommended Process Flow')!;
  const reference = [];
  for (let r = 0; r < flow.length; r++)
    for (let c = 0; c < Math.max(16, flow[r]?.length || 0); c++)
      reference.push({
        import_batch_id: batchId,
        source_worksheet: 'Recommended Process Flow',
        cell_address: a1(r, c),
        row_number: r + 1,
        column_number: c + 1,
        raw_value: flow[r]?.[c] === null || flow[r]?.[c] === undefined ? null : String(flow[r][c]),
      });
  for (let i = 0; i < reference.length; i += 500) {
    const { error } = await db
      .from('process_flow_reference_data')
      .upsert(reference.slice(i, i + 500), {
        onConflict: 'source_worksheet,cell_address,import_batch_id',
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
  counts.process_flow_reference_data = reference.length;
  const flowRows = flow
    .map((r, i) => ({ r, row: i + 1 }))
    .filter(
      ({ r, row }) =>
        row !== 3 &&
        row !== 10 &&
        [r[12], r[13], r[14], r[15]].some((v) => v !== null && v !== undefined && v !== ''),
    );
  for (const { r, row } of flowRows) {
    const detail = row >= 11;
    const payload = {
      display_order: row,
      stage: text(r[12]),
      activity: detail ? null : nullable(r[13]),
      responsible_party: detail ? nullable(r[13]) : nullable(r[14]),
      required_action: detail ? nullable(r[14]) : nullable(r[13]),
      target: detail ? nullable(r[15]) : null,
      target_business_days: Number(text(r[12]).match(/\d+/)?.[0] || 0) || null,
      source_row_number: row,
      import_batch_id: batchId,
      raw_record: { M: r[12] ?? null, N: r[13] ?? null, O: r[14] ?? null, P: r[15] ?? null },
    };
    const inserted = await db
      .from('process_flow_steps')
      .upsert(payload, { onConflict: 'source_worksheet,source_row_number', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();
    if (inserted.error) throw inserted.error;
    counts.process_flow_steps = (counts.process_flow_steps || 0) + (inserted.data ? 1 : 0);
    await mapRow(
      'Recommended Process Flow',
      row,
      hashRecord(r),
      'process_flow_steps',
      inserted.data?.id,
      inserted.data ? 'imported' : 'duplicate',
    );
  }
  const max = Math.max(...trackerRows.map(({ r }) => rfpNumeric(text(r[0]))), 0);
  const summary = {
    sourceCounts,
    importedCounts: counts,
    skippedCounts: skipped,
    warnings,
    originalRfpRange: trackerRows.length
      ? `${trackerRows[0].r[0]}–${trackerRows.at(-1)?.r[0]}`
      : null,
    nextRfpNumber: `RFP-${String(max + 1).padStart(4, '0')}`,
    backupPath: backup,
  };
  await db
    .from('migration_batches')
    .update({
      status: warnings.length ? 'completed_with_warnings' : 'completed',
      imported_counts: counts,
      skipped_counts: skipped,
      summary,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  console.log(JSON.stringify({ ok: true, batchId, summary }, null, 2));
} catch (error) {
  await db
    .from('migration_batches')
    .update({
      status: 'failed',
      summary: { error: error instanceof Error ? error.message : String(error) },
    })
    .eq('id', batchId);
  throw error;
}
