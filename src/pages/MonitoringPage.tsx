import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Database, RefreshCw, ScrollText } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Button, Spinner } from '../components/ui';
import { get } from '../lib/api';
import { useAuth } from '../components/AuthProvider';

const tabs = [
  ['requests', 'Active requests', 'Current RFP workflow records', Database],
  ['forms', 'Form responses', 'Original submitted response data', ClipboardList],
  ['logs', 'Approval log', 'Recorded decisions and status changes', ScrollText],
] as const;
const defaults: Record<string, string[]> = {
  requests: [
    'rfp_number',
    'submitted_at',
    'requestor_name',
    'company',
    'department',
    'supplier_payee',
    'amount',
    'department_approval',
    'finance_review',
    'final_status',
  ],
  forms: [
    'source_timestamp',
    'requestor_email',
    'requestor_name',
    'company',
    'department',
    'project_class',
    'rfp_type',
    'supplier_payee',
    'amount',
    'match_status',
  ],
  logs: [
    'occurred_at',
    'rfp_number',
    'action',
    'actor_email',
    'remarks',
    'previous_status',
    'new_status',
  ],
};
type Result = { rows: Record<string, unknown>[]; count: number; page: number; pageSize: number };
export function MonitoringPage() {
  const { roles } = useAuth();
  const available = tabs.filter(
    ([key]) =>
      roles.some((r) => ['super_administrator', 'administrator'].includes(r)) || key !== 'forms',
  );
  const [tab, setTab] = useState(available[0]?.[0] || 'requests');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState<Result>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>();
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return get<Result>(`monitoring/${tab}?page=${page}&pageSize=${pageSize}`)
      .then((result) => {
        setData(result);
        setLastUpdated(new Date());
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [page, pageSize, tab]);
  useEffect(() => {
    void load();
  }, [load]);
  const change = (key: string) => {
    setTab(key as typeof tab);
    setPage(1);
  };
  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Records workspace</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">RFP monitor</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Search, inspect, sort, and export the same live records used by the approval workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated && (
            <span className="last-updated">
              <span aria-hidden="true" />
              Updated{' '}
              {lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
            Refresh
          </Button>
        </div>
      </section>

      <div className="workspace-tabs overflow-x-auto">
        <div className="flex min-w-max gap-1 p-1.5">
          {available.map(([key, label, description, Icon]) => (
            <button
              key={key}
              onClick={() => change(key)}
              className={`workspace-tab ${tab === key ? 'workspace-tab-active' : ''}`}
              aria-pressed={tab === key}
            >
              <Icon size={17} />
              <span className="text-left">
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="card p-10 text-center">
          <Spinner />
        </div>
      ) : error ? (
        <p className="rounded bg-red-50 p-4 text-red-700">{error}</p>
      ) : (
        <DataTable
          key={tab}
          rows={data?.rows || []}
          total={data?.count || 0}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          defaultKeys={defaults[tab]}
          title={tabs.find(([key]) => key === tab)?.[1] || tab}
        />
      )}
    </div>
  );
}
