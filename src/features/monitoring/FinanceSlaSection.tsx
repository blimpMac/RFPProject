import { useMemo } from 'react';

export type FinanceSlaEntry = {
  approvalId: string;
  requestId: string | null;
  rfpNumber: string;
  amount: number | string | null;
  employeeId: string | null;
  employeeName: string;
  employeeEmail: string;
  receivedAt: string | null;
  approvedAt: string;
  deadlineAt: string | null;
  elapsedBusinessDays: number | null;
  status: 'within' | 'outside' | 'unmeasurable';
};

type EmployeeSummary = {
  key: string;
  name: string;
  email: string;
  within: number;
  outside: number;
  unmeasurable: number;
  approvedRequests: number;
  approvedAmount: number;
  amountRecords: number;
};

const localTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila',
      }).format(new Date(value))
    : '—';

const businessDays = (value: number | null) =>
  value === null ? '—' : `${value} business day${value === 1 ? '' : 's'}`;

export function FinanceSlaSection({
  rows,
  targetBusinessDays,
}: {
  rows: FinanceSlaEntry[];
  targetBusinessDays: number;
}) {
  const employees = useMemo(() => {
    const grouped = new Map<string, EmployeeSummary>();
    for (const row of rows) {
      const key = row.employeeId || row.employeeEmail.toLowerCase() || row.employeeName;
      const current = grouped.get(key) || {
        key,
        name: row.employeeName,
        email: row.employeeEmail,
        within: 0,
        outside: 0,
        unmeasurable: 0,
        approvedRequests: 0,
        approvedAmount: 0,
        amountRecords: 0,
      };
      if (row.status === 'within') current.within += 1;
      else if (row.status === 'outside') current.outside += 1;
      else current.unmeasurable += 1;
      grouped.set(key, current);
    }
    // Rows arrive newest-first. Keep only the latest Finance approval per RFP so
    // re-approvals do not double-count the request amount.
    const latestApprovalByRequest = new Map<string, FinanceSlaEntry>();
    for (const row of rows) {
      const requestKey = row.requestId || row.approvalId;
      if (!latestApprovalByRequest.has(requestKey)) latestApprovalByRequest.set(requestKey, row);
    }
    for (const row of latestApprovalByRequest.values()) {
      const key = row.employeeId || row.employeeEmail.toLowerCase() || row.employeeName;
      const employee = grouped.get(key);
      if (!employee) continue;
      employee.approvedRequests += 1;
      const amount = typeof row.amount === 'number'
        ? row.amount
        : row.amount === null || row.amount === ''
          ? Number.NaN
          : Number(String(row.amount).replace(/,/g, '').replace(/^₱\\s*/, ''));
      if (Number.isFinite(amount)) {
        employee.approvedAmount += amount;
        employee.amountRecords += 1;
      }
    }
    return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [rows]);

  const formatAmount = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

  const totals = useMemo(
    () =>
      employees.reduce(
        (total, employee) => ({
          within: total.within + employee.within,
          outside: total.outside + employee.outside,
          unmeasurable: total.unmeasurable + employee.unmeasurable,
        }),
        { within: 0, outside: 0, unmeasurable: 0 },
      ),
    [employees],
  );
  const measured = totals.within + totals.outside;
  const compliance = measured ? Math.round((totals.within / measured) * 100) : 0;

  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="text-lg font-semibold">Finance employee SLA performance</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Completed Finance member approvals are measured individually against the configured{' '}
            {targetBusinessDays}-business-day review target. The clock starts at the latest
            Department approval handoff; weekends are excluded.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Measured approvals" value={measured} detail="Within or outside SLA" />
          <Metric label="Within SLA" value={totals.within} detail="Approved on or before deadline" />
          <Metric label="Outside SLA" value={totals.outside} detail="Approved after deadline" />
          <Metric
            label="Compliance rate"
            value={measured ? `${compliance}%` : '—'}
            detail={`${totals.unmeasurable} missing handoff timestamp${totals.unmeasurable === 1 ? '' : 's'}`}
          />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="font-semibold">Breakdown by Finance employee</h3>
          <p className="mt-1 text-xs text-slate-500">
            Example: 9 / 10 within SLA means 9 approvals met the target and 1 did not.
          </p>
        </div>
        {employees.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                <tr>
                  <th className="px-5 py-3 font-semibold">Finance employee</th>
                  <th className="px-4 py-3 text-center font-semibold">Within SLA</th>
                  <th className="px-4 py-3 text-center font-semibold">Outside SLA</th>
                  <th className="px-4 py-3 text-center font-semibold">Measured total</th>
                  <th className="px-5 py-3 text-right font-semibold">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((employee) => {
                  const total = employee.within + employee.outside;
                  const rate = total ? Math.round((employee.within / total) * 100) : 0;
                  return (
                    <tr key={employee.key}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                          {employee.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{employee.email || '—'}</p>
                        {employee.unmeasurable > 0 && (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            {employee.unmeasurable} not measurable
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {employee.within} / {total}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                        {employee.outside}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{total}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {total ? `${rate}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No completed Finance member approvals have been recorded yet.
          </p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="font-semibold">Approved amount per Finance employee</h3>
          <p className="mt-1 text-xs text-slate-500">
            Total request value is attributed to the employee on the latest Finance approval for each unique RFP. Re-approvals are not counted twice.
          </p>
        </div>
        {employees.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                <tr>
                  <th className="px-5 py-3 font-semibold">Finance employee</th>
                  <th className="px-4 py-3 text-center font-semibold">Unique RFPs approved</th>
                  <th className="px-5 py-3 text-right font-semibold">Total approved amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((employee) => (
                  <tr key={employee.key}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{employee.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{employee.email || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{employee.approvedRequests}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {employee.amountRecords ? formatAmount(employee.approvedAmount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No approved Finance requests to total yet.</p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h3 className="font-semibold">Request-level SLA details</h3>
          <p className="mt-1 text-xs text-slate-500">
            Each row represents a Finance employee approval event. Requests without a recorded
            Finance handoff are marked Not measurable and excluded from the compliance rate.
          </p>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                <tr>
                  <th className="px-5 py-3 font-semibold">RFP #</th>
                  <th className="px-4 py-3 font-semibold">Finance employee</th>
                  <th className="px-4 py-3 font-semibold">Received by Finance</th>
                  <th className="px-4 py-3 font-semibold">Approved at</th>
                  <th className="px-4 py-3 font-semibold">Elapsed</th>
                  <th className="px-5 py-3 font-semibold">SLA result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.approvalId}>
                    <td className="px-5 py-3 font-semibold">{row.rfpNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.employeeName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.employeeEmail || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">{localTime(row.receivedAt)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{localTime(row.approvedAt)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {businessDays(row.elapsedBusinessDays)}
                    </td>
                    <td className="px-5 py-3">
                      <SlaStatus status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            There are no Finance approval records to display.
          </p>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function SlaStatus({ status }: { status: FinanceSlaEntry['status'] }) {
  const classes = {
    within:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    outside:
      'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
    unmeasurable:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  }[status];
  const label = {
    within: 'Within SLA',
    outside: 'Outside SLA',
    unmeasurable: 'Not measurable',
  }[status];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
