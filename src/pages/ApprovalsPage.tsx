import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import { Button, EmptyState, Modal, Spinner, StatusBadge } from '../components/ui';
import { useAuth } from '../components/AuthProvider';
import { get, post } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import type { RfpRequest } from '../types';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { AttachmentPreviewSection } from '../components/AttachmentPreviewSection';

type Result = { rows: RfpRequest[] };
type Action = { value: string; label: string };
type QueueFocus = 'all' | 'review' | 'sla' | 'signatory' | 'release';
type SlaInfo = { label: string; detail: string; tone: 'neutral' | 'good' | 'warning' | 'danger' };

const manilaDay = (value: string | number | Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 864e5;

function elapsedDays(value: string | null, now: number) {
  if (!value) return 0;
  return Math.max(0, dayNumber(manilaDay(now)) - dayNumber(manilaDay(value)));
}

function getSlaInfo(request: RfpRequest, now: number): SlaInfo {
  const status = request.final_status;
  if (status === 'Pending Department Approval') {
    const days = elapsedDays(request.submitted_at, now);
    return {
      label: `Department review · Day ${days + 1}`,
      detail: days > 1 ? `${days} days since submission` : 'Within department review window',
      tone: days > 1 ? 'warning' : 'neutral',
    };
  }
  if (['Pending Finance Review', 'Documentation Required'].includes(status)) {
    const days = elapsedDays(request.department_approval_at || request.submitted_at, now);
    return {
      label: `${status === 'Documentation Required' ? 'Documents' : 'Finance review'} · Day ${days + 1}`,
      detail:
        days > 0
          ? `${days} day${days === 1 ? '' : 's'} since finance handoff`
          : 'Received by Finance today',
      tone: days > 1 ? 'danger' : days > 0 ? 'warning' : 'neutral',
    };
  }
  if (/returned/i.test(status)) {
    return {
      label: 'Returned for action',
      detail: 'Waiting for correction or re-review',
      tone: 'warning',
    };
  }
  if (/paid/i.test(status)) {
    return { label: 'Completed', detail: 'Payment workflow completed', tone: 'good' };
  }
  if (request.planned_check_date) {
    const today = manilaDay(now);
    const difference = dayNumber(request.planned_check_date) - dayNumber(today);
    if (difference < 0)
      return {
        label: `${Math.abs(difference)} day${Math.abs(difference) === 1 ? '' : 's'} overdue`,
        detail: `Target was ${manilaDate(request.planned_check_date)}`,
        tone: 'danger',
      };
    if (difference === 0)
      return {
        label: 'Release due today',
        detail: 'Planned release date is today',
        tone: 'warning',
      };
    return {
      label: `${difference} day${difference === 1 ? '' : 's'} to target`,
      detail: `Planned for ${manilaDate(request.planned_check_date)}`,
      tone: 'good',
    };
  }
  return {
    label: 'No target date',
    detail: 'Set a release target when processing begins',
    tone: /processing|check/i.test(status) ? 'warning' : 'neutral',
  };
}

const financeActionOptions = (status: string): Action[] => {
  if (['Pending Finance Review', 'Documentation Required'].includes(status))
    return [
      { value: 'approve', label: 'Approve and start processing' },
      { value: 'reject', label: 'Return to Department Approver' },
      { value: 'request_documents', label: 'Request documents' },
    ];
  if (['Approved for Payment', 'Payment Processing'].includes(status))
    return [{ value: 'payment_processing', label: 'Start processing' }];
  if (status === 'Processing')
    return [{ value: 'check_preparation', label: 'Prepare check and documents' }];
  if (status === 'Check Preparation')
    return [{ value: 'awaiting_signatory', label: 'Send for check approval' }];
  if (['Check Approval', 'Awaiting Signatory'].includes(status))
    return [{ value: 'check_released', label: 'Record check release' }];
  if (['Check Released', 'Payment Released'].includes(status))
    return [{ value: 'payment_released', label: 'Mark payment completed' }];
  return [];
};

export function ApprovalsPage() {
  const { roles } = useAuth();
  const [rows, setRows] = useState<RfpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RfpRequest>();
  const [action, setAction] = useState('');
  const [remarks, setRemarks] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'pending' | 'completed'>('pending');
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [queueFocus, setQueueFocus] = useState<QueueFocus>('all');
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const load = useCallback(
    () =>
      get<Result>('monitoring/requests?page=1&pageSize=200')
        .then((result) => {
          setRows(result.rows);
          setNow(Date.now());
          setError('');
        })
        .catch((cause) => setError(cause.message))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(load);
  const finance = roles.some((role) =>
    ['super_administrator', 'administrator', 'finance_reviewer'].includes(role),
  );
  const department = roles.some((role) =>
    ['super_administrator', 'administrator', 'department_approver'].includes(role),
  );
  const matchesQueueFocus = useCallback(
    (request: RfpRequest) => {
      if (queueFocus === 'all') return true;
      if (queueFocus === 'review')
        return ['Pending Finance Review', 'Documentation Required'].includes(request.final_status);
      if (queueFocus === 'sla')
        return ['warning', 'danger'].includes(getSlaInfo(request, now).tone);
      if (queueFocus === 'signatory')
        return ['Check Preparation', 'Check Approval', 'Awaiting Signatory'].includes(
          request.final_status,
        );
      return ['Check Released', 'Payment Released'].includes(request.final_status);
    },
    [now, queueFocus],
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(
      (request) =>
        (!company || request.company === company) &&
        (!statusFilter || request.final_status === statusFilter) &&
        (!query ||
          [
            request.rfp_number,
            request.requestor_name,
            request.requestor_email,
            request.department,
            request.supplier_payee,
            request.project_class,
            request.purpose_description,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)) &&
        matchesQueueFocus(request) &&
        (view === 'pending'
          ? !/paid|returned to requestor/i.test(request.final_status)
          : /paid|returned to requestor/i.test(request.final_status)),
    );
  }, [company, matchesQueueFocus, rows, search, statusFilter, view]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const paginatedRows = useMemo(
    () => visibleRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleRows],
  );
  useEffect(() => {
    setPage(1);
  }, [company, pageSize, queueFocus, search, statusFilter, view]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const companyOptions = [
    ...new Set(rows.flatMap((request) => (request.company ? [request.company] : []))),
  ];
  const statusOptions = [...new Set(rows.map((request) => request.final_status))].sort();
  const queueCounts = useMemo(() => {
    const activeRows = rows.filter(
      (request) => !/paid|returned to requestor/i.test(request.final_status),
    );
    return {
      review: activeRows.filter((request) =>
        ['Pending Finance Review', 'Documentation Required'].includes(request.final_status),
      ).length,
      sla: activeRows.filter((request) =>
        ['warning', 'danger'].includes(getSlaInfo(request, now).tone),
      ).length,
      signatory: activeRows.filter((request) =>
        ['Check Preparation', 'Check Approval', 'Awaiting Signatory'].includes(
          request.final_status,
        ),
      ).length,
      release: activeRows.filter((request) =>
        ['Check Released', 'Payment Released'].includes(request.final_status),
      ).length,
    };
  }, [now, rows]);
  const hasFilters = Boolean(company || search || statusFilter || queueFocus !== 'all');
  const applyQueueFocus = (focus: QueueFocus) => {
    setQueueFocus((current) => (current === focus ? 'all' : focus));
    setView('pending');
  };
  const clearFilters = () => {
    setCompany('');
    setSearch('');
    setStatusFilter('');
    setQueueFocus('all');
  };
  const departmentReturn = selected?.final_status === 'Returned to Department Approver';
  const departmentPending = selected?.final_status === 'Pending Department Approval';
  const departmentStage = departmentPending || departmentReturn;
  const choices = selected
    ? departmentStage && department
      ? [
          {
            value: 'department_approve',
            label: departmentReturn
              ? 'Re-approve and return to Finance'
              : 'Approve and send to Finance',
          },
          { value: 'department_reject', label: 'Return to Requestor' },
        ]
      : finance
        ? financeActionOptions(selected.final_status)
        : []
    : [];
  const departmentAction = action.startsWith('department_');
  const needsTarget = ['approve', 'payment_processing'].includes(action);

  const save = async () => {
    if (!selected || !action) return;
    if (needsTarget && !checkDate && !selected.planned_check_date) {
      setError('A target release date is required before processing can begin.');
      return;
    }
    if (action === 'department_reject' && !remarks.trim()) {
      setError('Remarks are required when returning a request to the Requestor.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (departmentAction)
        await post('department/action', {
          requestId: selected.id,
          decision: action === 'department_approve' ? 'approve' : 'reject',
          remarks,
        });
      else
        await post('finance/action', {
          requestId: selected.id,
          action,
          remarks,
          plannedCheckDate: checkDate || null,
          changeReason: reason || null,
        });
      setSelected(undefined);
      setAction('');
      setRemarks('');
      setCheckDate('');
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Workflow control</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Approval queue</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Review requests, monitor finance SLA stages, and move payments through release.
          </p>
        </div>
        <span className="live-refresh-indicator">Live · refreshes every 15 seconds</span>
      </div>
      {finance && (
        <section className="queue-health-grid" aria-label="Finance queue health">
          <QueueHealthCard
            active={queueFocus === 'review'}
            count={queueCounts.review}
            icon={<WalletCards size={18} />}
            label="Needs finance review"
            detail="Decision or documents required"
            onClick={() => applyQueueFocus('review')}
          />
          <QueueHealthCard
            active={queueFocus === 'sla'}
            count={queueCounts.sla}
            icon={<AlertTriangle size={18} />}
            label="SLA attention"
            detail="Aging or target-date risk"
            tone="warning"
            onClick={() => applyQueueFocus('sla')}
          />
          <QueueHealthCard
            active={queueFocus === 'signatory'}
            count={queueCounts.signatory}
            icon={<ShieldCheck size={18} />}
            label="Signatory stage"
            detail="Check preparation and approval"
            tone="violet"
            onClick={() => applyQueueFocus('signatory')}
          />
          <QueueHealthCard
            active={queueFocus === 'release'}
            count={queueCounts.release}
            icon={<CalendarClock size={18} />}
            label="Ready to complete"
            detail="Released checks awaiting closure"
            tone="green"
            onClick={() => applyQueueFocus('release')}
          />
        </section>
      )}

      <section className="approval-filter-panel" aria-label="Approval queue filters">
        <div className="approval-view-toggle" role="group" aria-label="Request view">
          <button
            className={view === 'pending' ? 'active' : ''}
            onClick={() => setView('pending')}
            aria-pressed={view === 'pending'}
          >
            Active
          </button>
          <button
            className={view === 'completed' ? 'active' : ''}
            onClick={() => setView('completed')}
            aria-pressed={view === 'completed'}
          >
            Completed / returned
          </button>
        </div>
        <label className="approval-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search approval queue</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search RFP, payee, or requestor"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear approval search">
              <X size={15} />
            </button>
          )}
        </label>
        <select
          className="input"
          aria-label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          {statusOptions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        >
          <option value="">All companies</option>
          {companyOptions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        {hasFilters && (
          <button className="approval-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </section>
      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="card overflow-hidden">
        <div className="divide-y">
          {paginatedRows.map((request) => (
            <div
              className="approval-request-row grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
              key={request.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{request.rfp_number}</p>
                  <StatusBadge>{request.final_status}</StatusBadge>
                  <RequestSla request={request} now={now} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {request.requestor_name} · {request.company || 'Company not recorded'} ·{' '}
                  {request.department} · {request.supplier_payee}
                </p>
                <div className="approval-request-meta">
                  <span>Submitted {manilaDate(request.submitted_at, true)}</span>
                  <span>{php.format(request.amount)}</span>
                  {request.planned_check_date && (
                    <span>Target {manilaDate(request.planned_check_date)}</span>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelected(request);
                  setAction('');
                  setCheckDate(request.planned_check_date || '');
                  setError('');
                }}
              >
                Open request
              </Button>
            </div>
          ))}
        </div>
        {!visibleRows.length && (
          <EmptyState title="No requests" body={`There are no ${view} approvals in this view.`} />
        )}
        {visibleRows.length > 0 && (
          <div className="approval-pagination">
            <p>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleRows.length)} of{' '}
              {visibleRows.length}
            </p>
            <div className="approval-page-controls">
              <label>
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label="Approval rows per page"
                >
                  {[10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                Page {page} of {pageCount}
              </span>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                aria-label="Previous approval page"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page === pageCount}
                aria-label="Next approval page"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>
      {selected && (
        <Modal title={selected.rfp_number} onClose={() => setSelected(undefined)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['Requestor', selected.requestor_name],
              ['Company', selected.company || 'Not recorded'],
              ['Department', selected.department],
              ['Supplier / Payee', selected.supplier_payee],
              ['Amount', php.format(selected.amount)],
              ['Required date', manilaDate(selected.required_payment_date)],
              ['Target release', manilaDate(selected.planned_check_date)],
              ['SLA position', getSlaInfo(selected, now).label],
              ['Current stage', selected.final_status],
              ['Approving heads', selected.approving_head],
              ['Department approval', selected.department_approval],
              ['Finance review', selected.finance_review],
              ['Purpose', selected.purpose_description],
            ].map(([key, value]) => (
              <div
                key={key}
                className={key === 'Purpose' || key === 'Approving heads' ? 'sm:col-span-2' : ''}
              >
                <p className="text-xs font-semibold uppercase text-slate-500">{key}</p>
                <p className="mt-1 text-sm">{value}</p>
              </div>
            ))}
          </div>
          <AttachmentPreviewSection requestId={selected.id} />
          {choices.length > 0 && (
            <div className="mt-6 border-t pt-5">
              <h3 className="font-semibold">Next workflow action</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <select
                  className="input sm:col-span-2"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                >
                  <option value="">Select action…</option>
                  {choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {!departmentStage && (
                  <>
                    <div className="field sm:col-span-2">
                      <label htmlFor="target-date">
                        Target release date{needsTarget ? ' *' : ''}
                      </label>
                      <input
                        id="target-date"
                        className="input"
                        type="date"
                        value={checkDate}
                        onChange={(event) => setCheckDate(event.target.value)}
                      />
                    </div>
                    <input
                      className="input sm:col-span-2"
                      placeholder="Reason for changing target date"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </>
                )}
                <textarea
                  className="input min-h-24 sm:col-span-2"
                  placeholder={
                    departmentAction ? 'Remarks (required when returning to requestor)' : 'Remarks'
                  }
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => void save()} disabled={!action || busy}>
                  {busy ? (
                    <Spinner label="Saving" />
                  ) : (
                    <>
                      <Check size={17} />
                      Save action
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          {(finance || department) && !choices.length && (
            <p className="mt-5 rounded bg-slate-50 p-3 text-sm text-slate-600">
              No further system action is available for this status.
            </p>
          )}
          {!finance && !department && (
            <p className="mt-5 rounded bg-blue-50 p-3 text-sm text-blue-800">
              <FileQuestion className="mr-2 inline" size={16} />
              Department decisions are completed through the secure email review link.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function QueueHealthCard({
  active,
  count,
  detail,
  icon,
  label,
  onClick,
  tone = 'blue',
}: {
  active: boolean;
  count: number;
  detail: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'blue' | 'warning' | 'violet' | 'green';
}) {
  return (
    <button
      className={`queue-health-card ${active ? 'queue-health-card-active' : ''}`}
      data-tone={tone}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="queue-health-icon">{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="queue-health-count">{count}</span>
    </button>
  );
}

function RequestSla({ request, now }: { request: RfpRequest; now: number }) {
  const sla = getSlaInfo(request, now);
  return (
    <span className="sla-badge" data-tone={sla.tone} title={sla.detail}>
      <CalendarClock size={13} />
      {sla.label}
    </span>
  );
}
