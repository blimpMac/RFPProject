import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileText, XCircle } from 'lucide-react';
import {
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
  BarChart,
  Bar,
} from 'recharts';
import { get } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import { EmptyState, Spinner, StatusBadge } from '../components/ui';
import { calculateDashboardStats } from '../features/dashboard/stats';

type RequestRow = {
  id: string;
  rfp_number: string;
  submitted_at: string;
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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [now] = useState(() => Date.now());
  useEffect(() => {
    get<Dashboard>('dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const requests = useMemo(
    () =>
      data?.requests.filter(
        (r) =>
          (!department || r.department === department) &&
          (!from || r.submitted_at >= from) &&
          (!to || r.submitted_at < `${to}T23:59:59`),
      ) || [],
    [data, department, from, to],
  );
  const stats = useMemo(() => calculateDashboardStats(requests), [requests]);
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    requests.forEach((r) => {
      const k = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        year: '2-digit',
      }).format(new Date(r.submitted_at));
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map].map(([month, count]) => ({ month, count })).reverse();
  }, [requests]);
  const byDepartment = useMemo(() => {
    const map = new Map<string, number[]>();
    requests.forEach((r) => {
      const end = r.finance_review_at || r.department_approval_at;
      if (end) {
        const list = map.get(r.department) || [];
        list.push((new Date(end).getTime() - new Date(r.submitted_at).getTime()) / 36e5);
        map.set(r.department, list);
      }
    });
    return [...map].map(([name, v]) => ({
      name,
      hours: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    }));
  }, [requests]);
  if (!data && !error) return <Spinner />;
  if (error) return <p className="rounded bg-red-50 p-4 text-red-700">{error}</p>;
  const cards = [
    ['Total RFP requests', stats.total, FileText, 'text-blue-700'],
    ['Approved requests', stats.approved, CheckCircle2, 'text-emerald-700'],
    ['Rejected requests', stats.rejected, XCircle, 'text-red-700'],
    ['Pending requests', stats.pending, Clock3, 'text-amber-700'],
    ['Average turnaround', `${stats.avg.toFixed(1)} hrs`, Clock3, 'text-slate-700'],
  ] as const;
  const pie = [
    { name: 'Approved', value: stats.approved, color: '#2f855a' },
    { name: 'Rejected', value: stats.rejected, color: '#c05640' },
    { name: 'Pending', value: stats.pending, color: '#d69e2e' },
  ];
  const departments = [...new Set(data!.requests.map((r) => r.department))];
  const overdue = requests.filter(
    (r) =>
      !/paid|released|rejected|returned/i.test(r.final_status) &&
      now - new Date(r.submitted_at).getTime() > 4 * 864e5,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Operational summary based on live Supabase records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input w-auto"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <input
            className="input w-auto"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <input
            className="input w-auto"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value, Icon, color]) => (
          <div className="card p-4" key={label}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <Icon className={color} size={19} />
            </div>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Request status">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pie} dataKey="value" innerRadius={56} outerRadius={82}>
                {pie.map((x) => (
                  <Cell key={x.name} fill={x.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs">
            {pie.map((x) => (
              <span key={x.name}>
                <i
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ background: x.color }}
                />
                {x.name} {x.value}
              </span>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Monthly request trends">
          <ResponsiveContainer width="100%" height={275}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line dataKey="count" stroke="#315c93" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Processing duration by department">
          <ResponsiveContainer width="100%" height={275}>
            <BarChart data={byDepartment} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={82} />
              <Tooltip />
              <Bar dataKey="hours" fill="#52796f" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Recently submitted</h2>
          </div>
          {requests.slice(0, 6).map((r) => (
            <div className="flex items-center gap-3 border-b px-5 py-3 last:border-0" key={r.id}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.rfp_number}</p>
                <p className="truncate text-xs text-slate-500">
                  {r.department} · {manilaDate(r.submitted_at, true)}
                </p>
              </div>
              <span className="text-sm">{php.format(r.amount)}</span>
              <StatusBadge>{r.final_status}</StatusBadge>
            </div>
          ))}
          {!requests.length && (
            <EmptyState title="No requests" body="No requests match the current filters." />
          )}
        </section>
        <section className="card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Attention required</h2>
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle size={14} />
              {overdue.length} overdue
            </span>
          </div>
          {overdue.slice(0, 6).map((r) => (
            <div className="flex items-center gap-3 border-b px-5 py-3 last:border-0" key={r.id}>
              <div className="flex-1">
                <p className="font-medium">{r.rfp_number}</p>
                <p className="text-xs text-slate-500">
                  Pending {Math.floor((Date.now() - new Date(r.submitted_at).getTime()) / 864e5)}{' '}
                  days
                </p>
              </div>
              <StatusBadge>{r.final_status}</StatusBadge>
            </div>
          ))}
          {!overdue.length && (
            <EmptyState
              title="Nothing overdue"
              body="No filtered requests are older than four days."
            />
          )}
        </section>
      </div>
    </div>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
