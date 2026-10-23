import { useCallback, useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { AuditTrailResponse } from '../../shared/contracts/audit-trail';
import { DataTable } from '../components/DataTable';
import { Button, Spinner } from '../components/ui';
import { get } from '../lib/api';

const auditedTables = [
  'rfp_requests',
  'approvers',
  'department_approving_heads',
  'profiles',
  'request_attachments',
  'process_flow_steps',
  'system_settings',
  'user_roles',
] as const;

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
    return result.rows as unknown as Record<string, unknown>[];
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
            Review database changes and export filtered records for Google Sheets monitoring.
          </p>
        </div>
      </div>

      <section className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="field">
          <span>Table</span>
          <select
            className="input"
            value={filters.table}
            onChange={(event) => updateFilter('table', event.target.value)}
          >
            <option value="">All audited tables</option>
            {auditedTables.map((table) => (
              <option key={table} value={table}>
                {table.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Operation</span>
          <select
            className="input"
            value={filters.operation}
            onChange={(event) => updateFilter('operation', event.target.value)}
          >
            <option value="">All operations</option>
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
          rows={(data?.rows || []) as unknown as Record<string, unknown>[]}
          total={data?.count || 0}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          defaultKeys={[
            'occurred_at',
            'table_name',
            'operation',
            'actor_email',
            'record_id',
            'changed_fields',
          ]}
          title="Audit Trail"
          loadExportRows={loadExportRows}
        />
      )}
    </div>
  );
}
