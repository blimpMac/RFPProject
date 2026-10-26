import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileQuestion,
  Printer,
  RefreshCw,
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
type QueueFocus = 'all' | 'member' | 'head' | 'hardcopy' | 'processing' | 'overdue';
type SlaInfo = { label: string; detail: string; tone: 'neutral' | 'good' | 'warning' | 'danger' };
type FinanceOperations = NonNullable<NonNullable<RfpRequest['raw_record']>['finance_operations']>;

const manilaDay = (value: string | number | Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 864e5;

const financeOperations = (request: RfpRequest): FinanceOperations =>
  request.raw_record?.finance_operations || {};

const requiresOriginals = (request: RfpRequest) => {
  void request;
  return true;
};

const financeWorkflow = (request: RfpRequest) => request.raw_record?.finance_workflow || {};

const processingOverdue = (request: RfpRequest, now: number) => {
  const dueAt = financeWorkflow(request).processing_due_at;
  return Boolean(
    dueAt &&
    new Date(dueAt).getTime() < now &&
    !/paid|returned to requestor/i.test(request.final_status),
  );
};

const displayStatus = (request: RfpRequest, now: number) =>
  processingOverdue(request, now) ? 'Overdue' : request.final_status;

function elapsedDays(value: string | null, now: number) {
  if (!value) return 0;
  return Math.max(0, dayNumber(manilaDay(now)) - dayNumber(manilaDay(value)));
}

function getSlaInfo(request: RfpRequest, now: number): SlaInfo {
  const status = request.final_status;
  const processingDue = financeWorkflow(request).processing_due_at;
  if (processingDue && !/paid|returned to requestor/i.test(status)) {
    const difference = new Date(processingDue).getTime() - now;
    if (difference < 0) {
      const overdueHours = Math.max(1, Math.ceil(Math.abs(difference) / 36e5));
      return {
        label: `${overdueHours}h overdue`,
        detail: `3-day processing deadline was ${manilaDate(processingDue, true)}`,
        tone: 'danger',
      };
    }
    const hours = Math.max(1, Math.ceil(difference / 36e5));
    return {
      label: `${hours}h left in 3-day process`,
      detail: `Processing deadline ${manilaDate(processingDue, true)}`,
      tone: hours <= 24 ? 'warning' : 'good',
    };
  }
  if (status === 'Pending Department Approval') {
    const days = elapsedDays(request.submitted_at, now);
    return {
      label: `Department review · Day ${days + 1}`,
      detail: days > 1 ? `${days} days since submission` : 'Within department review window',
      tone: days > 1 ? 'warning' : 'neutral',
    };
  }
  if (status === 'Pending Finance Head Review') {
    return {
      label: 'Finance Head decision',
      detail: 'At least one Finance member has approved',
      tone: 'warning',
    };
  }
  if (status === 'Awaiting Hard Copy Verification') {
    return {
      label: 'Hard-copy gate',
      detail: 'Manual document verification is required before processing',
      tone: 'warning',
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

const financeActionOptions = (status: string, financeHead: boolean): Action[] => {
  if (['Pending Finance Review', 'Documentation Required'].includes(status))
    return [
      { value: 'member_approve', label: 'Approve as Finance member' },
      { value: 'member_reject', label: 'Return to Department Head' },
      { value: 'request_documents', label: 'Request documents / clarification' },
    ];
  if (status === 'Pending Finance Head Review')
    return financeHead
      ? [
          { value: 'head_approve', label: 'Finance Head approve' },
          { value: 'head_reject', label: 'Finance Head decline and return to Requestor' },
        ]
      : [];
  if (status === 'Awaiting Hard Copy Verification')
    return [
      {
        value: 'hard_copy_approve',
        label: 'Approve hard copies and start 3-day processing',
      },
    ];
  if (['Approved for Payment', 'Payment Processing'].includes(status))
    return [{ value: 'payment_processing', label: 'Start legacy processing' }];
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
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [originalsDate, setOriginalsDate] = useState('');
  const [documentVerification, setDocumentVerification] = useState('');
  const [verificationRemarks, setVerificationRemarks] = useState('');
  const [financeNotes, setFinanceNotes] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(
    () =>
      get<Result>('monitoring/requests?page=1&pageSize=200')
        .then((result) => {
          setRows(result.rows);
          setNow(Date.now());
          setLastRefresh(Date.now());
          setSelected((current) =>
            current ? result.rows.find((request) => request.id === current.id) || current : current,
          );
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
    ['super_administrator', 'administrator', 'finance_head', 'finance_reviewer'].includes(role),
  );
  const financeHead = roles.some((role) =>
    ['super_administrator', 'administrator', 'finance_head'].includes(role),
  );
  const department = roles.some((role) =>
    ['super_administrator', 'administrator', 'department_approver'].includes(role),
  );
  const matchesQueueFocus = useCallback(
    (request: RfpRequest) => {
      if (queueFocus === 'all') return true;
      if (queueFocus === 'member')
        return ['Pending Finance Review', 'Documentation Required'].includes(request.final_status);
      if (queueFocus === 'head') return request.final_status === 'Pending Finance Head Review';
      if (queueFocus === 'hardcopy')
        return request.final_status === 'Awaiting Hard Copy Verification';
      if (queueFocus === 'processing')
        return (
          ['Processing', 'Check Preparation', 'Check Approval', 'Awaiting Signatory'].includes(
            request.final_status,
          ) && !processingOverdue(request, now)
        );
      return processingOverdue(request, now);
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
      member: activeRows.filter((request) =>
        ['Pending Finance Review', 'Documentation Required'].includes(request.final_status),
      ).length,
      head: activeRows.filter((request) => request.final_status === 'Pending Finance Head Review')
        .length,
      hardcopy: activeRows.filter(
        (request) => request.final_status === 'Awaiting Hard Copy Verification',
      ).length,
      processing: activeRows.filter(
        (request) =>
          ['Processing', 'Check Preparation', 'Check Approval', 'Awaiting Signatory'].includes(
            request.final_status,
          ) && !processingOverdue(request, now),
      ).length,
      overdue: activeRows.filter((request) => processingOverdue(request, now)).length,
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
  const openRequest = (request: RfpRequest) => {
    const operations = financeOperations(request);
    setSelected(request);
    setAction('');
    setRemarks('');
    setCheckDate(request.planned_check_date || '');
    setReason('');
    setOriginalsDate(operations.originals_received_date || '');
    setDocumentVerification(operations.document_verification || '');
    setVerificationRemarks(operations.verification_remarks || '');
    setFinanceNotes(request.finance_remarks || '');
    setNotice('');
    setError('');
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
        ? financeActionOptions(selected.final_status, financeHead)
        : []
    : [];
  const departmentAction = action.startsWith('department_');
  const needsTarget = action === 'payment_processing';

  const save = async () => {
    if (!selected || !action) return;
    if (needsTarget && !checkDate && !selected.planned_check_date) {
      setError('A target release date is required before processing can begin.');
      return;
    }
    if (
      ['department_reject', 'member_reject', 'head_reject', 'request_documents'].includes(action) &&
      !remarks.trim()
    ) {
      setError('Remarks are required for return, decline, or document-request actions.');
      return;
    }
    if (
      action === 'hard_copy_approve' &&
      (financeOperations(selected).document_verification !== 'Complete' ||
        !financeOperations(selected).originals_received_date)
    ) {
      setError('Save a complete hard-copy verification before starting processing.');
      return;
    }
    if (
      !departmentAction &&
      selected.planned_check_date &&
      checkDate !== selected.planned_check_date &&
      !reason.trim()
    ) {
      setError('Add a reason for changing the planned release date.');
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

  const saveFinanceUpdates = async () => {
    if (!selected || !finance) return;
    if (requiresOriginals(selected) && documentVerification === 'Complete' && !originalsDate) {
      setError('Record the original documents received date before marking them complete.');
      return;
    }
    if (
      requiresOriginals(selected) &&
      documentVerification === 'Incomplete' &&
      !verificationRemarks.trim()
    ) {
      setError('Describe the missing or incomplete documents.');
      return;
    }
    if (
      selected.planned_check_date &&
      checkDate !== selected.planned_check_date &&
      !reason.trim()
    ) {
      setError('Add a reason for changing the planned release date.');
      return;
    }
    setUpdateBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await post<{ request: RfpRequest }>('finance/update', {
        requestId: selected.id,
        originalsReceivedDate: originalsDate || null,
        documentVerification: documentVerification || null,
        verificationRemarks: verificationRemarks || null,
        financeRemarks: financeNotes || null,
        plannedCheckDate: checkDate || null,
        changeReason: reason || null,
      });
      setRows((current) =>
        current.map((request) => (request.id === result.request.id ? result.request : request)),
      );
      openRequest(result.request);
      setNotice('Finance records saved and added to the approval log.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Finance updates could not be saved.');
    } finally {
      setUpdateBusy(false);
    }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Finance / Workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {finance ? 'Finance Dashboard' : 'Approval Queue'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Monitor requests, manage Finance actions, and follow up on every SLA stage.
          </p>
        </div>
        <div className="finance-refresh-group">
          <span className="live-refresh-indicator">
            Updated{' '}
            {new Intl.DateTimeFormat('en-PH', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(lastRefresh)}
          </span>
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw size={16} />
            Refresh data
          </Button>
        </div>
      </div>
      {finance && (
        <section className="queue-health-grid" aria-label="Finance queue health">
          <QueueHealthCard
            active={queueFocus === 'member'}
            count={queueCounts.member}
            icon={<WalletCards size={18} />}
            label="Finance member review"
            detail="At least one member approval"
            onClick={() => applyQueueFocus('member')}
          />
          <QueueHealthCard
            active={queueFocus === 'head'}
            count={queueCounts.head}
            icon={<ShieldCheck size={18} />}
            label="Finance Head review"
            detail="Administrator decision gate"
            tone="violet"
            onClick={() => applyQueueFocus('head')}
          />
          <QueueHealthCard
            active={queueFocus === 'hardcopy'}
            count={queueCounts.hardcopy}
            icon={<FileCheck2 size={18} />}
            label="Hard-copy verification"
            detail="Required before processing"
            tone="warning"
            onClick={() => applyQueueFocus('hardcopy')}
          />
          <QueueHealthCard
            active={queueFocus === 'processing'}
            count={queueCounts.processing}
            icon={<CalendarClock size={18} />}
            label="3-day processing"
            detail="Active monitoring window"
            tone="green"
            onClick={() => applyQueueFocus('processing')}
          />
          <QueueHealthCard
            active={queueFocus === 'overdue'}
            count={queueCounts.overdue}
            icon={<CalendarClock size={18} />}
            label="Overdue"
            detail="Past the 3-day processing deadline"
            tone="amber"
            onClick={() => applyQueueFocus('overdue')}
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
      {error && !selected && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && !selected && (
        <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}
      <div className="card overflow-hidden">
        <div className="finance-table-heading">
          <div>
            <h2>RFP Requests</h2>
            <p>Choose a request to review details and manage its Finance status.</p>
          </div>
          <span>{visibleRows.length} matching requests</span>
        </div>
        <div className="finance-table-wrap">
          <table className="finance-request-table">
            <thead>
              <tr>
                <th>RFP No.</th>
                <th>Requestor / Department</th>
                <th>Supplier / Payee</th>
                <th>Amount</th>
                <th>Current Status</th>
                <th>SLA Stage</th>
                <th>Planned Check</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((request) => (
                <tr key={request.id} onClick={() => openRequest(request)}>
                  <td>
                    <button
                      className="finance-rfp-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRequest(request);
                      }}
                    >
                      {request.rfp_number}
                    </button>
                    <small>{request.company || 'Company not recorded'}</small>
                  </td>
                  <td>
                    <strong>{request.requestor_name}</strong>
                    <small>{request.department}</small>
                  </td>
                  <td>{request.supplier_payee}</td>
                  <td className="finance-amount">{php.format(request.amount)}</td>
                  <td>
                    <StatusBadge>{displayStatus(request, now)}</StatusBadge>
                  </td>
                  <td>
                    <RequestSla request={request} now={now} />
                  </td>
                  <td>{manilaDate(request.planned_check_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <Modal title={selected.rfp_number} size="wide" onClose={() => setSelected(undefined)}>
          <div className="finance-modal-summary">
            <div>
              <StatusBadge>{displayStatus(selected, now)}</StatusBadge>
              <RequestSla request={selected} now={now} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p>
                {selected.company || 'Company not recorded'} · Submitted{' '}
                {manilaDate(selected.submitted_at, true)}
              </p>
              {finance && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    window.open(`/admin/rfp/${selected.id}/print`, '_blank', 'noopener,noreferrer')
                  }
                >
                  <Printer size={16} />
                  Print digital RFP
                </Button>
              )}
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
              {notice}
            </p>
          )}
          <h3 className="finance-section-title">Request details</h3>
          <div className="finance-detail-grid">
            {[
              ['Requestor', selected.requestor_name],
              ['Department', selected.department],
              ['Requestor email', selected.requestor_email],
              ['RFP type', selected.rfp_type],
              ['Type of request', String(selected.raw_record?.request_type || 'Not recorded')],
              ['Supplier / Payee', selected.supplier_payee],
              ['Amount', php.format(selected.amount)],
              ['Project / Class', selected.project_class],
              ['Required date', manilaDate(selected.required_payment_date)],
              ['Submitted date', manilaDate(selected.submitted_at, true)],
              ['Target release', manilaDate(selected.planned_check_date)],
              ['SLA position', getSlaInfo(selected, now).label],
              ['Current stage', displayStatus(selected, now)],
              ['Approving heads', selected.approving_head],
              ['Department approval', selected.department_approval],
              ['Department remarks', selected.department_approval_remarks || '—'],
              [
                'Finance member review',
                financeWorkflow(selected).member_status || selected.finance_review,
              ],
              ['Finance head review', financeWorkflow(selected).head_status || 'Pending'],
              ['Hard-copy approval', financeWorkflow(selected).hard_copy_status || 'Pending'],
              [
                '3-day processing due',
                manilaDate(financeWorkflow(selected).processing_due_at || null, true),
              ],
              ['Finance remarks', selected.finance_remarks || '—'],
              ['Purpose', selected.purpose_description],
            ].map(([key, value]) => (
              <div
                key={key}
                className={
                  ['Purpose', 'Approving heads', 'Department remarks', 'Finance remarks'].includes(
                    key,
                  )
                    ? 'finance-detail-wide'
                    : ''
                }
              >
                <p>{key}</p>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <AttachmentPreviewSection requestId={selected.id} />
          {finance && (
            <section className="finance-update-section">
              <h3 className="finance-section-title">Finance updates</h3>
              <div className="finance-update-grid">
                <div className="field">
                  <label htmlFor="originals-date">Original documents received date</label>
                  <input
                    id="originals-date"
                    className="input"
                    type="date"
                    disabled={!requiresOriginals(selected)}
                    value={originalsDate}
                    onChange={(event) => setOriginalsDate(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="document-verification">Original documents verification</label>
                  <select
                    id="document-verification"
                    className="input"
                    disabled={!requiresOriginals(selected)}
                    value={documentVerification}
                    onChange={(event) => setDocumentVerification(event.target.value)}
                  >
                    <option value="">Select status</option>
                    <option value="Complete">Complete</option>
                    <option value="Incomplete">Incomplete</option>
                  </select>
                </div>
                <div className="field finance-update-wide">
                  <label htmlFor="verification-remarks">
                    Verification remarks / missing documents
                  </label>
                  <textarea
                    id="verification-remarks"
                    className="input min-h-24"
                    disabled={!requiresOriginals(selected)}
                    placeholder={'Required when documents are incomplete'}
                    value={verificationRemarks}
                    onChange={(event) => setVerificationRemarks(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="target-date">Planned check / release date</label>
                  <input
                    id="target-date"
                    className="input"
                    type="date"
                    value={checkDate}
                    onChange={(event) => setCheckDate(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="target-date-reason">Reason for changing target date</label>
                  <input
                    id="target-date-reason"
                    className="input"
                    placeholder="Required when changing an existing date"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
                <div className="field finance-update-wide">
                  <label htmlFor="finance-notes">Finance remarks / internal notes</label>
                  <textarea
                    id="finance-notes"
                    className="input min-h-24"
                    placeholder="Add a note for the Finance team"
                    value={financeNotes}
                    onChange={(event) => setFinanceNotes(event.target.value)}
                  />
                </div>
              </div>
              <div className="finance-update-footer">
                <p>
                  Every RFP must record received hard copies and a Complete verification after
                  Finance Head approval. The 3-day processing clock starts only when a Finance
                  member approves this hard-copy gate.
                </p>
                <Button onClick={() => void saveFinanceUpdates()} disabled={updateBusy}>
                  {updateBusy ? <Spinner label="Saving" /> : 'Save Finance updates'}
                </Button>
              </div>
            </section>
          )}
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
  tone?: 'blue' | 'warning' | 'amber' | 'violet' | 'green';
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
