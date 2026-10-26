import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { get } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import { Button, EmptyState, Spinner, StatusBadge } from '../components/ui';
import { calculateDashboardStats } from '../features/dashboard/stats';

type RequestRow = {
  id: string;
  rfp_number: string;
  submitted_at: string;
  company: string | null;
  department: string;
  amount: number;
  final_status: string;
  department_approval_at: string | null;
  finance_review_at: string | null;
};
type Dashboard = {
  metrics: Record<string, number>;
  requests: RequestRow[];
  recentActivity: Record<string, unknown>[];
};

export function DashboardPage() {
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('');
  const [company, setCompany] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setError('');
    try {
      const result = await get<Dashboard>('dashboard');
      setData(result);
      setNow(Date.now());
      setLastUpdated(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the dashboard.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const requests = useMemo(
    () =>
      data?.requests.filter(
        (request) =>
          (!department || request.department === department) &&
          (!company || request.company === company) &&
          (!from || request.submitted_at >= from) &&
          (!to || request.submitted_at < `${to}T23:59:59`),
      ) || [],
    [company, data, department, from, to],
  );
  const stats = useMemo(() => calculateDashboardStats(requests), [requests]);
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    requests.forEach((request) => {
      const key = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        year: '2-digit',
      }).format(new Date(request.submitted_at));
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map].map(([month, count]) => ({ month, count })).reverse();
  }, [requests]);
  const byDepartment = useMemo(() => {
    const map = new Map<string, number[]>();
    requests.forEach((request) => {
      const end = request.finance_review_at || request.department_approval_at;
      if (!end) return;
      const list = map.get(request.department) || [];
      list.push((new Date(end).getTime() - new Date(request.submitted_at).getTime()) / 36e5);
      map.set(request.department, list);
    });
    return [...map].map(([name, values]) => ({
      name,
      hours: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
    }));
  }, [requests]);

  if (!data && !error) {
    return (
      <div className="card grid min-h-80 place-items-center">
        <Spinner label="Preparing your workspace" />
      </div>
    );
  }
  if (!data && error) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>;

  const filtersActive = Boolean(company || department || from || to);
  const pendingValue = requests
    .filter((request) => !/paid|released|rejected|returned/i.test(request.final_status))
    .reduce((total, request) => total + Number(request.amount || 0), 0);
  const overdue = requests.filter(
    (request) =>
      !/paid|released|rejected|returned/i.test(request.final_status) &&
      now - new Date(request.submitted_at).getTime() > 4 * 864e5,
  );
  const cards = [
    {
      label: 'Requests in view',
      value: stats.total.toLocaleString(),
      detail: filtersActive ? 'Filtered result' : 'All accessible records',
      icon: FileText,
      tone: 'blue',
    },
    {
      label: 'Pending value',
      value: php.format(pendingValue),
      detail: `${stats.pending} active request${stats.pending === 1 ? '' : 's'}`,
      icon: Banknote,
      tone: 'violet',
    },
    {
      label: 'Completed',
      value: stats.approved.toLocaleString(),
      detail: stats.total
        ? `${Math.round((stats.approved / stats.total) * 100)}% of requests`
        : 'No requests yet',
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      label: 'Returned',
      value: stats.rejected.toLocaleString(),
      detail: 'Needs correction or review',
      icon: XCircle,
      tone: 'red',
    },
    {
      label: 'Avg. turnaround',
      value: `${stats.avg.toFixed(1)} hrs`,
      detail: 'Submission to latest review',
      icon: Clock3,
      tone: 'amber',
    },
  ] as const;
  const pie = [
    { name: 'Completed', value: stats.approved, color: '#0f9f6e' },
    { name: 'Returned', value: stats.rejected, color: '#e45d59' },
    { name: 'In progress', value: stats.pending, color: '#f0a43c' },
  ];
  const departments = [...new Set(data!.requests.map((request) => request.department))];
  const companies = [
    ...new Set(data!.requests.flatMap((request) => (request.company ? [request.company] : []))),
  ];

  const clearFilters = () => {
    setCompany('');
    setDepartment('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="space-y-6">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Live operations</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Payment requests at a glance
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Follow throughput, spot delayed requests, and move finance work forward from one view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="last-updated">
            <span aria-hidden="true" />
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
              : 'Connecting'}
          </span>
          <Button variant="secondary" disabled={refreshing} onClick={() => void load()}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} size={16} />
            Refresh
          </Button>
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}

      <section className="filter-panel" aria-label="Dashboard filters">
        <div className="filter-panel-heading">
          <div>
            <p className="text-sm font-semibold">Refine overview</p>
            <p className="text-xs text-slate-500">All figures and charts update together.</p>
          </div>
          {filtersActive && (
            <button className="filter-reset" onClick={clearFilters}>
              <RotateCcw size={14} />
              Reset filters
            </button>
          )}
        </div>
        <div className="filter-grid">
          <label>
            <span>Company</span>
            <select
              className="input"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Department</span>
            <select
              className="input"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Submitted from</span>
            <input
              className="input"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            <span>Submitted to</span>
            <input
              className="input"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="metric-grid" aria-label="Request performance">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => (
          <article className="metric-card" data-tone={tone} key={label}>
            <div className="metric-icon">
              <Icon size={19} />
            </div>
            <p className="metric-label">{label}</p>
            <p className="metric-value">{value}</p>
            <p className="metric-detail">{detail}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <ChartCard title="Request mix" subtitle="Current status distribution">
          <div className="relative">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={68} outerRadius={94} paddingAngle={3}>
                  {pie.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-center-label" aria-hidden="true">
              <strong>{stats.total}</strong>
              <span>Total</span>
            </div>
          </div>
          <div className="chart-legend">
            {pie.map((item) => (
              <span key={item.name}>
                <i style={{ background: item.color }} />
                {item.name}
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Request volume" subtitle="Submissions by month">
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={monthly} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 5" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#087ea4"
                strokeWidth={3}
                dot={{ fill: '#087ea4', strokeWidth: 3, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <ChartCard title="Processing time" subtitle="Average hours by department">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={byDepartment}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="4 5" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={92} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="hours" fill="#13a079" radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="card overflow-hidden">
          <div className="section-heading">
            <div>
              <h2>Attention required</h2>
              <p>Open requests older than four days</p>
            </div>
            <span className="attention-count">
              <AlertTriangle size={14} />
              {overdue.length}
            </span>
          </div>
          <div className="divide-y">
            {overdue.slice(0, 5).map((request) => (
              <div className="request-row" key={request.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{request.rfp_number}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {request.department} · Pending{' '}
                    {Math.floor((now - new Date(request.submitted_at).getTime()) / 864e5)} days
                  </p>
                </div>
                <StatusBadge>{request.final_status}</StatusBadge>
              </div>
            ))}
          </div>
          {!overdue.length && (
            <EmptyState title="Everything is moving" body="No requests in this view are overdue." />
          )}
          <Link className="section-link" to="/admin/approvals">
            Open approval queue <ArrowRight size={15} />
          </Link>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="section-heading">
          <div>
            <h2>Recently submitted</h2>
            <p>The latest payment requests in this view</p>
          </div>
          <Link className="section-link-inline" to="/admin/monitoring">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        <div className="divide-y">
          {requests.slice(0, 6).map((request) => (
            <div className="request-row recent-request-row" key={request.id}>
              <div className="request-id-mark" aria-hidden="true">
                {request.rfp_number.slice(-2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{request.rfp_number}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {request.company || 'Company not recorded'} · {request.department} ·{' '}
                  {manilaDate(request.submitted_at, true)}
                </p>
              </div>
              <span className="hidden text-sm font-semibold sm:block">
                {php.format(request.amount)}
              </span>
              <StatusBadge>{request.final_status}</StatusBadge>
            </div>
          ))}
        </div>
        {!requests.length && (
          <EmptyState title="No requests found" body="Try resetting the current filters." />
        )}
      </section>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card chart-card p-5 sm:p-6">
      <div className="mb-3">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
