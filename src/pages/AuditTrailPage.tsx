import { useCallback, useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { AuditTrailResponse, AuditTrailRow } from '../../shared/contracts/audit-trail';
import { DataTable } from '../components/DataTable';
import { Button, Spinner } from '../components/ui';
import { get } from '../lib/api';
import { manilaDate, php } from '../lib/format';

const activityAreas = [
  ['rfp_requests', 'Requests', 'request'],
  ['approvers', 'Department approvers', 'department approver'],
  ['department_approving_heads', 'Approval team', 'approval team assignment'],
  ['profiles', 'Staff accounts', 'staff account'],
  ['request_attachments', 'Supporting documents', 'supporting document'],
  ['process_flow_steps', 'Workflow setup', 'workflow step'],
  ['system_settings', 'System settings', 'setting'],
  ['user_roles', 'Staff access', 'staff access assignment'],
] as const;
const areaByTable = new Map<string, string>(activityAreas.map(([table, label]) => [table, label]));
const singularByTable = new Map<string, string>(
  activityAreas.map(([table, , singular]) => [table, singular]),
);
const operationLabels: Record<string, string> = {
  INSERT: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
};
const fieldLabels: Record<string, string> = {
  active: 'Active status',
  amount: 'Amount',
  approver_email: 'Approver email',
  approver_name: 'Approver name',
  approving_head: 'Approving head',
  company: 'Company',
  department: 'Department',
  department_approval: 'Department review',
  department_approval_remarks: 'Department remarks',
  description: 'Description',
  email: 'Email',
  finance_remarks: 'Finance remarks',
  finance_review: 'Finance review',
  final_status: 'Workflow status',
  full_name: 'Name',
  key: 'Setting name',
  last_action: 'Latest action',
  mime_type: 'File type',
  original_filename: 'Filename',
  planned_check_date: 'Planned release date',
  position: 'Approval order',
  required_payment_date: 'Required payment date',
  rfp_number: 'RFP number',
  role: 'Access level',
  supplier_payee: 'Supplier / Payee',
  value: 'Setting value',
};
const hiddenFields = new Set([
  'id',
  'actor_user_id',
  'approver_id',
  'created_at',
  'created_by',
  'department_approved_by',
  'finance_reviewed_by',
  'granted_by',
  'import_batch_id',
  'normalized_department',
  'normalized_rfp_type',
  'source_row_number',
  'source_worksheet',
  'updated_at',
  'updated_by',
  'user_id',
  'version',
]);

type Filters = { table: string; operation: string; from: string; to: string };
const emptyFilters: Filters = { table: '', operation: '', from: '', to: '' };

function queryString(filters: Filters, page: number, pageSize: number, exporting = false) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.table) query.set('table', filters.table);
  if (filters.operation) query.set('operation', filters.operation);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (exporting) query.set('export', 'true');
  return query.toString();
}

function shortValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'amount') return php.format(Number(value));
  if (key.endsWith('_at') || key.endsWith('_date'))
    return manilaDate(String(value), key.endsWith('_at'));
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return 'Updated settings';
  const text = String(value);
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}

function recordName(row: AuditTrailRow) {
  const values = row.after || row.before || {};
  const candidates = [
    values.rfp_number,
    values.original_filename,
    values.full_name,
    values.approver_name,
    values.email,
    values.department,
    values.key,
  ];
  return String(candidates.find((value) => value) || 'Record');
}

function changeDescription(row: AuditTrailRow) {
  const singular = singularByTable.get(row.table_name) || 'record';
  if (row.operation === 'INSERT') return `A new ${singular} was added.`;
  if (row.operation === 'DELETE') return `The ${singular} was removed.`;

  const fields = row.changed_fields.filter((field) => !hiddenFields.has(field));
  if (!fields.length) return `The ${singular} information was updated.`;
  const descriptions = fields.slice(0, 4).map((field) => {
    const label = fieldLabels[field] || field.replaceAll('_', ' ');
    const before = shortValue(field, row.before?.[field]);
    const after = shortValue(field, row.after?.[field]);
    return `${label}: ${before} → ${after}`;
  });
  if (fields.length > 4) descriptions.push(`${fields.length - 4} more changes`);
  return descriptions.join('; ');
}

function friendlyRows(rows: AuditTrailRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    date_time: row.occurred_at,
    area: areaByTable.get(row.table_name) || 'System activity',
    action: operationLabels[row.operation] || 'Changed',
    changed_by: row.actor_email || 'System process',
    record: recordName(row),
    details: changeDescription(row),
  }));
}

export function AuditTrailPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState<AuditTrailResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = useMemo(() => queryString(filters, page, pageSize), [filters, page, pageSize]);

  useEffect(() => {
    setLoading(true);
    setError('');
    get<AuditTrailResponse>(`audit-trail?${query}`)
      .then(setData)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Could not load the audit trail.'),
      )
      .finally(() => setLoading(false));
  }, [query]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const loadExportRows = useCallback(async () => {
    const result = await get<AuditTrailResponse>(
      `audit-trail?${queryString(filters, 1, pageSize, true)}`,
    );
    return friendlyRows(result.rows);
  }, [filters, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-50 p-2 text-[#315c93]">
          <History size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Audit Trail</h1>
          <p className="text-sm text-slate-500">
            See who changed what, when it happened, and export the activity for monitoring.
          </p>
        </div>
      </div>

      <section className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="field">
          <span>Activity area</span>
          <select
            className="input"
            value={filters.table}
            onChange={(event) => updateFilter('table', event.target.value)}
          >
            <option value="">All activity areas</option>
            {activityAreas.map(([table, label]) => (
              <option key={table} value={table}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Change made</span>
          <select
            className="input"
            value={filters.operation}
            onChange={(event) => updateFilter('operation', event.target.value)}
          >
            <option value="">All changes</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="DELETE">Deleted</option>
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input
            className="input"
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            className="input"
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => {
              setFilters(emptyFilters);
              setPage(1);
            }}
          >
            Reset filters
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="card p-10 text-center">
          <Spinner label="Loading audit trail" />
        </div>
      ) : error ? (
        <p className="rounded bg-red-50 p-4 text-red-700" role="alert">
          {error}
        </p>
      ) : (
        <DataTable
          rows={friendlyRows(data?.rows || [])}
          total={data?.count || 0}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          defaultKeys={['date_time', 'area', 'action', 'changed_by', 'record', 'details']}
          title="Audit Trail"
          loadExportRows={loadExportRows}
        />
      )}
    </div>
  );
}
