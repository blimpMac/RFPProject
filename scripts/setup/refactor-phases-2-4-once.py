from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Could not find {label}')
    return text.replace(old, new, 1)


def write_approval_feature_modules() -> None:
    root = Path('src/features/approvals')
    root.mkdir(parents=True, exist_ok=True)

    (root / 'workflow.ts').write_text("""import { manilaDate } from '../../lib/format';
import type { RfpRequest } from '../../types';
import { manilaDay } from '../requests/sla';

export type Action = { value: string; label: string };
export type QueueFocus = 'all' | 'member' | 'head' | 'hardcopy' | 'processing';
export type SlaInfo = {
  label: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warning' | 'danger';
};
export type FinanceOperations = NonNullable<
  NonNullable<RfpRequest['raw_record']>['finance_operations']
>;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 864e5;

export { manilaDay };

export const financeOperations = (request: RfpRequest): FinanceOperations =>
  request.raw_record?.finance_operations || {};

export const requiresOriginals = (_request: RfpRequest) => true;

export const financeWorkflow = (request: RfpRequest) => request.raw_record?.finance_workflow || {};

export const processingOverdue = (request: RfpRequest, now: number) => {
  const dueAt = financeWorkflow(request).processing_due_at;
  return Boolean(
    dueAt &&
      new Date(dueAt).getTime() < now &&
      !/paid|returned to requestor/i.test(request.final_status),
  );
};

export const displayStatus = (request: RfpRequest, now: number) =>
  processingOverdue(request, now) ? 'Overdue' : request.final_status;

function elapsedDays(value: string | null, now: number) {
  if (!value) return 0;
  return Math.max(0, dayNumber(manilaDay(now)) - dayNumber(manilaDay(value)));
}

export function getSlaInfo(request: RfpRequest, now: number): SlaInfo {
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
    if (difference < 0) {
      const days = Math.abs(difference);
      return {
        label: `${days} day${days === 1 ? '' : 's'} overdue`,
        detail: `Target was ${manilaDate(request.planned_check_date)}`,
        tone: 'danger',
      };
    }
    if (difference === 0) {
      return {
        label: 'Release due today',
        detail: 'Planned release date is today',
        tone: 'warning',
      };
    }
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

export const financeActionOptions = (status: string, financeHead: boolean): Action[] => {
  if (['Pending Finance Review', 'Documentation Required'].includes(status)) {
    return [
      { value: 'member_approve', label: 'Approve as Finance member' },
      { value: 'member_reject', label: 'Return to Department Head' },
      { value: 'request_documents', label: 'Request documents / clarification' },
    ];
  }
  if (status === 'Pending Finance Head Review') {
    return financeHead
      ? [
          { value: 'head_approve', label: 'Finance Head approve' },
          { value: 'head_reject', label: 'Finance Head decline and return to Requestor' },
        ]
      : [];
  }
  if (status === 'Awaiting Hard Copy Verification') {
    return [
      {
        value: 'hard_copy_approve',
        label: 'Approve hard copies and start 3-day processing',
      },
    ];
  }
  if (['Approved for Payment', 'Payment Processing'].includes(status)) {
    return [{ value: 'payment_processing', label: 'Start legacy processing' }];
  }
  if (status === 'Processing') {
    return [{ value: 'check_preparation', label: 'Prepare check and documents' }];
  }
  if (status === 'Check Preparation') {
    return [{ value: 'awaiting_signatory', label: 'Send for check approval' }];
  }
  if (['Check Approval', 'Awaiting Signatory'].includes(status)) {
    return [{ value: 'check_released', label: 'Record check release' }];
  }
  if (['Check Released', 'Payment Released'].includes(status)) {
    return [{ value: 'payment_released', label: 'Mark payment completed' }];
  }
  return [];
};
""")

    (root / 'RequestSla.tsx').write_text("""import { CalendarClock } from 'lucide-react';
import type { RfpRequest } from '../../types';
import { getSlaInfo } from './workflow';

export function RequestSla({ request, now }: { request: RfpRequest; now: number }) {
  const sla = getSlaInfo(request, now);
  return (
    <span className="sla-badge" data-tone={sla.tone} title={sla.detail}>
      <CalendarClock size={13} />
      {sla.label}
    </span>
  );
}
""")

    (root / 'FinanceQueueHealth.tsx').write_text("""import { CalendarClock, FileCheck2, ShieldCheck, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import type { QueueFocus } from './workflow';

export type FinanceQueueCounts = {
  member: number;
  head: number;
  hardcopy: number;
  processing: number;
  overdue: number;
};

export function FinanceQueueHealth({
  queueFocus,
  counts,
  onFocus,
}: {
  queueFocus: QueueFocus;
  counts: FinanceQueueCounts;
  onFocus: (focus: QueueFocus) => void;
}) {
  return (
    <section className="queue-health-grid" aria-label="Finance queue health">
      <QueueHealthCard
        active={queueFocus === 'member'}
        count={counts.member}
        icon={<WalletCards size={18} />}
        label="Finance member review"
        detail="At least one member approval"
        onClick={() => onFocus('member')}
      />
      <QueueHealthCard
        active={queueFocus === 'head'}
        count={counts.head}
        icon={<ShieldCheck size={18} />}
        label="Finance Head review"
        detail="Super Administrator decision"
        tone="violet"
        onClick={() => onFocus('head')}
      />
      <QueueHealthCard
        active={queueFocus === 'hardcopy'}
        count={counts.hardcopy}
        icon={<FileCheck2 size={18} />}
        label="Hard-copy verification"
        detail="Required before processing"
        tone="warning"
        onClick={() => onFocus('hardcopy')}
      />
      <QueueHealthCard
        active={queueFocus === 'processing'}
        count={counts.processing}
        icon={<CalendarClock size={18} />}
        label="3-day processing"
        detail={
          counts.overdue ? `${counts.overdue} overdue · 3-day window` : '3-day monitoring window'
        }
        tone="green"
        onClick={() => onFocus('processing')}
      />
    </section>
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
      type="button"
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
""")

    (root / 'ApprovalQueueFilters.tsx').write_text("""import { Search, X } from 'lucide-react';

export function ApprovalQueueFilters({
  view,
  search,
  statusFilter,
  fromDate,
  toDate,
  company,
  statusOptions,
  companyOptions,
  hasFilters,
  onViewChange,
  onSearchChange,
  onStatusChange,
  onFromDateChange,
  onToDateChange,
  onCompanyChange,
  onClear,
}: {
  view: 'pending' | 'completed';
  search: string;
  statusFilter: string;
  fromDate: string;
  toDate: string;
  company: string;
  statusOptions: string[];
  companyOptions: string[];
  hasFilters: boolean;
  onViewChange: (value: 'pending' | 'completed') => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onCompanyChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="approval-filter-panel" aria-label="Approval queue filters">
      <div className="approval-view-toggle" role="group" aria-label="Request view">
        <button
          type="button"
          className={view === 'pending' ? 'active' : ''}
          onClick={() => onViewChange('pending')}
          aria-pressed={view === 'pending'}
        >
          Active
        </button>
        <button
          type="button"
          className={view === 'completed' ? 'active' : ''}
          onClick={() => onViewChange('completed')}
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
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search RFP, payee, or requestor"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange('')} aria-label="Clear approval search">
            <X size={15} />
          </button>
        )}
      </label>
      <select
        className="input"
        aria-label="Status"
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        <option value="">All statuses</option>
        {statusOptions.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <input
        className="input"
        aria-label="Submitted from date"
        title="Submitted from"
        type="date"
        value={fromDate}
        onChange={(event) => onFromDateChange(event.target.value)}
      />
      <input
        className="input"
        aria-label="Submitted to date"
        title="Submitted to"
        type="date"
        value={toDate}
        onChange={(event) => onToDateChange(event.target.value)}
      />
      <select
        className="input"
        aria-label="Company"
        value={company}
        onChange={(event) => onCompanyChange(event.target.value)}
      >
        <option value="">All companies</option>
        {companyOptions.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      {hasFilters && (
        <button type="button" className="approval-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </section>
  );
}
""")

    (root / 'ApprovalQueueTable.tsx').write_text("""import { ChevronLeft, ChevronRight, Eye, Pencil, Printer } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/ui';
import { php } from '../../lib/format';
import type { RfpRequest } from '../../types';
import { RequestSla } from './RequestSla';
import { displayStatus } from './workflow';

export function ApprovalQueueTable({
  visibleRows,
  paginatedRows,
  view,
  page,
  pageSize,
  pageCount,
  finance,
  department,
  now,
  onPageChange,
  onPageSizeChange,
  onOpenRequest,
}: {
  visibleRows: RfpRequest[];
  paginatedRows: RfpRequest[];
  view: 'pending' | 'completed';
  page: number;
  pageSize: number;
  pageCount: number;
  finance: boolean;
  department: boolean;
  now: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenRequest: (request: RfpRequest, mode: 'view' | 'edit') => void;
}) {
  return (
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
              <th>Request</th>
              <th>Requestor / Department</th>
              <th>Amount</th>
              <th>Status / SLA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((request) => (
              <tr
                key={request.id}
                onClick={() => {
                  if (finance) onOpenRequest(request, 'view');
                  else if (department) onOpenRequest(request, 'edit');
                }}
              >
                <td>
                  <button
                    type="button"
                    className="finance-rfp-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRequest(request, finance ? 'view' : 'edit');
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
                <td className="finance-amount">{php.format(request.amount)}</td>
                <td>
                  <StatusBadge>{displayStatus(request, now)}</StatusBadge>
                  <RequestSla request={request} now={now} />
                </td>
                <td>
                  <div className="finance-row-actions">
                    {finance && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRequest(request, 'view');
                        }}
                      >
                        <Eye size={14} /> View
                      </button>
                    )}
                    {(finance || department) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRequest(request, 'edit');
                        }}
                      >
                        <Pencil size={14} /> {finance ? 'Edit' : 'Review'}
                      </button>
                    )}
                    {finance && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.open(
                            `/admin/rfp/${request.id}/print`,
                            '_blank',
                            'noopener,noreferrer',
                          );
                        }}
                      >
                        <Printer size={14} /> Print
                      </button>
                    )}
                  </div>
                </td>
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
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
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
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous approval page"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              disabled={page === pageCount}
              aria-label="Next approval page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
""")

    (root / 'FinanceUpdateForm.tsx').write_text("""import { Button, Spinner } from '../../components/ui';
import type { RfpRequest } from '../../types';
import { requiresOriginals } from './workflow';

export function FinanceUpdateForm({
  request,
  originalsDate,
  documentVerification,
  verificationRemarks,
  checkDate,
  reason,
  checkNumber,
  paymentReference,
  processingStatus,
  lateDocuments,
  financeNotes,
  busy,
  onOriginalsDateChange,
  onDocumentVerificationChange,
  onVerificationRemarksChange,
  onCheckDateChange,
  onReasonChange,
  onCheckNumberChange,
  onPaymentReferenceChange,
  onProcessingStatusChange,
  onLateDocumentsChange,
  onFinanceNotesChange,
  onSave,
}: {
  request: RfpRequest;
  originalsDate: string;
  documentVerification: string;
  verificationRemarks: string;
  checkDate: string;
  reason: string;
  checkNumber: string;
  paymentReference: string;
  processingStatus: string;
  lateDocuments: string;
  financeNotes: string;
  busy: boolean;
  onOriginalsDateChange: (value: string) => void;
  onDocumentVerificationChange: (value: string) => void;
  onVerificationRemarksChange: (value: string) => void;
  onCheckDateChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onCheckNumberChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onProcessingStatusChange: (value: string) => void;
  onLateDocumentsChange: (value: string) => void;
  onFinanceNotesChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="finance-update-section">
      <h3 className="finance-section-title">Finance updates</h3>
      <div className="finance-update-grid">
        <div className="field">
          <label htmlFor="originals-date">Original documents received date</label>
          <input
            id="originals-date"
            className="input"
            type="date"
            disabled={!requiresOriginals(request)}
            value={originalsDate}
            onChange={(event) => onOriginalsDateChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="document-verification">Original documents verification</label>
          <select
            id="document-verification"
            className="input"
            disabled={!requiresOriginals(request)}
            value={documentVerification}
            onChange={(event) => onDocumentVerificationChange(event.target.value)}
          >
            <option value="">Select status</option>
            <option value="Complete">Complete</option>
            <option value="Incomplete">Incomplete</option>
          </select>
        </div>
        <div className="field finance-update-wide">
          <label htmlFor="verification-remarks">Verification remarks / missing documents</label>
          <textarea
            id="verification-remarks"
            className="input min-h-24"
            disabled={!requiresOriginals(request)}
            placeholder="Required when documents are incomplete"
            value={verificationRemarks}
            onChange={(event) => onVerificationRemarksChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="target-date">Planned check / release date</label>
          <input
            id="target-date"
            className="input"
            type="date"
            value={checkDate}
            onChange={(event) => onCheckDateChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="target-date-reason">Reason for changing target date</label>
          <input
            id="target-date-reason"
            className="input"
            placeholder="Required when changing an existing date"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="check-number">Check number</label>
          <input
            id="check-number"
            className="input"
            placeholder="If issued"
            value={checkNumber}
            onChange={(event) => onCheckNumberChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="payment-reference">Payment reference</label>
          <input
            id="payment-reference"
            className="input"
            placeholder="Bank or payment reference"
            value={paymentReference}
            onChange={(event) => onPaymentReferenceChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="processing-status">Receipt processing status</label>
          <select
            id="processing-status"
            className="input"
            value={processingStatus}
            onChange={(event) => onProcessingStatusChange(event.target.value)}
          >
            <option value="">Use workflow status</option>
            {['For Processing', 'Check Preparation', 'Check Approval', 'Check Released', 'Paid'].map(
              (status) => (
                <option key={status}>{status}</option>
              ),
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="late-documents">Late documents received</label>
          <textarea
            id="late-documents"
            className="input min-h-24"
            placeholder="One document per line"
            value={lateDocuments}
            onChange={(event) => onLateDocumentsChange(event.target.value)}
          />
        </div>
        <div className="field finance-update-wide">
          <label htmlFor="finance-notes">Finance remarks / internal notes</label>
          <textarea
            id="finance-notes"
            className="input min-h-24"
            placeholder="Add a note for the Finance team"
            value={financeNotes}
            onChange={(event) => onFinanceNotesChange(event.target.value)}
          />
        </div>
      </div>
      <div className="finance-update-footer">
        <p>
          Every RFP must record received hard copies and a Complete verification after Finance Head
          approval. The 3-day processing clock starts only when a Finance member approves this
          hard-copy gate.
        </p>
        <Button onClick={onSave} disabled={busy}>
          {busy ? <Spinner label="Saving" /> : 'Save Finance updates'}
        </Button>
      </div>
    </section>
  );
}
""")

    (root / 'WorkflowActionPanel.tsx').write_text("""import { Check, FileQuestion } from 'lucide-react';
import { Button, Spinner } from '../../components/ui';
import type { Action } from './workflow';

export function WorkflowActionPanel({
  choices,
  action,
  remarks,
  departmentAction,
  busy,
  finance,
  department,
  onActionChange,
  onRemarksChange,
  onSave,
}: {
  choices: Action[];
  action: string;
  remarks: string;
  departmentAction: boolean;
  busy: boolean;
  finance: boolean;
  department: boolean;
  onActionChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onSave: () => void;
}) {
  if (choices.length > 0) {
    return (
      <div className="mt-6 border-t pt-5">
        <h3 className="font-semibold">Next workflow action</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select
            className="input sm:col-span-2"
            value={action}
            onChange={(event) => onActionChange(event.target.value)}
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
            placeholder={departmentAction ? 'Remarks (required when returning to requestor)' : 'Remarks'}
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onSave} disabled={!action || busy}>
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
    );
  }

  if (finance || department) {
    return (
      <p className="mt-5 rounded bg-slate-50 p-3 text-sm text-slate-600">
        No further system action is available for this status.
      </p>
    );
  }

  return (
    <p className="mt-5 rounded bg-blue-50 p-3 text-sm text-blue-800">
      <FileQuestion className="mr-2 inline" size={16} />
      Department decisions are completed through the secure email review link.
    </p>
  );
}
""")


def refactor_approvals_page() -> None:
    path = Path('src/pages/ApprovalsPage.tsx')
    text = path.read_text()

    text = replace_once(
        text,
        "import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';",
        "import { useCallback, useEffect, useMemo, useState } from 'react';",
        'React import',
    )
    icon_start = text.index("import {\n  CalendarClock,")
    icon_end = text.index("} from 'lucide-react';", icon_start) + len("} from 'lucide-react';")
    text = text[:icon_start] + "import { Eye, Pencil, Printer, RefreshCw } from 'lucide-react';" + text[icon_end:]
    text = replace_once(
        text,
        "import { Button, EmptyState, Modal, Spinner, StatusBadge } from '../components/ui';",
        "import { Button, Modal, Spinner, StatusBadge } from '../components/ui';",
        'UI import',
    )
    text = replace_once(
        text,
        "import { useAutoRefresh } from '../hooks/useAutoRefresh';",
        """import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ApprovalQueueFilters } from '../features/approvals/ApprovalQueueFilters';
import { ApprovalQueueTable } from '../features/approvals/ApprovalQueueTable';
import { FinanceQueueHealth } from '../features/approvals/FinanceQueueHealth';
import { FinanceUpdateForm } from '../features/approvals/FinanceUpdateForm';
import { RequestSla } from '../features/approvals/RequestSla';
import { WorkflowActionPanel } from '../features/approvals/WorkflowActionPanel';
import {
  displayStatus,
  financeActionOptions,
  financeOperations,
  financeWorkflow,
  getSlaInfo,
  manilaDay,
  processingOverdue,
  requiresOriginals,
  type QueueFocus,
} from '../features/approvals/workflow';""",
        'approval feature imports',
    )

    type_start = text.index('type Result =')
    page_start = text.index('export function ApprovalsPage()')
    local_types = """type Result = { rows: RfpRequest[] };
type ReceiptData = { request: RfpRequest; attachments: DigitalRfpAttachment[] };
type ModalMode = 'view' | 'edit';

"""
    text = text[:type_start] + local_types + text[page_start:]

    queue_start = text.index("      {finance && (\n        <section className=\"queue-health-grid\"")
    filter_start = text.index("      <section className=\"approval-filter-panel\"", queue_start)
    queue_component = """      {finance && (
        <FinanceQueueHealth
          queueFocus={queueFocus}
          counts={queueCounts}
          onFocus={applyQueueFocus}
        />
      )}

"""
    text = text[:queue_start] + queue_component + text[filter_start:]

    filter_start = text.index("      <section className=\"approval-filter-panel\"")
    filter_end = text.index("      {error && !selected && (", filter_start)
    filter_component = """      <ApprovalQueueFilters
        view={view}
        search={search}
        statusFilter={statusFilter}
        fromDate={fromDate}
        toDate={toDate}
        company={company}
        statusOptions={statusOptions}
        companyOptions={companyOptions}
        hasFilters={hasFilters}
        onViewChange={setView}
        onSearchChange={setSearch}
        onStatusChange={setStatusFilter}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onCompanyChange={setCompany}
        onClear={clearFilters}
      />
"""
    text = text[:filter_start] + filter_component + text[filter_end:]

    table_start = text.index("      <div className=\"card overflow-hidden\">")
    selected_start = text.index("      {selected && (", table_start)
    table_component = """      <ApprovalQueueTable
        visibleRows={visibleRows}
        paginatedRows={paginatedRows}
        view={view}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        finance={finance}
        department={department}
        now={now}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onOpenRequest={openRequest}
      />
"""
    text = text[:table_start] + table_component + text[selected_start:]

    finance_update_start = text.index("          {finance && modalMode === 'edit' && (\n            <section className=\"finance-update-section\">")
    action_start = text.index("          {modalMode === 'edit' && choices.length > 0 && (", finance_update_start)
    finance_update_component = """          {finance && modalMode === 'edit' && (
            <FinanceUpdateForm
              request={selected}
              originalsDate={originalsDate}
              documentVerification={documentVerification}
              verificationRemarks={verificationRemarks}
              checkDate={checkDate}
              reason={reason}
              checkNumber={checkNumber}
              paymentReference={paymentReference}
              processingStatus={processingStatus}
              lateDocuments={lateDocuments}
              financeNotes={financeNotes}
              busy={updateBusy}
              onOriginalsDateChange={setOriginalsDate}
              onDocumentVerificationChange={setDocumentVerification}
              onVerificationRemarksChange={setVerificationRemarks}
              onCheckDateChange={setCheckDate}
              onReasonChange={setReason}
              onCheckNumberChange={setCheckNumber}
              onPaymentReferenceChange={setPaymentReference}
              onProcessingStatusChange={setProcessingStatus}
              onLateDocumentsChange={setLateDocuments}
              onFinanceNotesChange={setFinanceNotes}
              onSave={() => void saveFinanceUpdates()}
            />
          )}
"""
    text = text[:finance_update_start] + finance_update_component + text[action_start:]

    action_start = text.index("          {modalMode === 'edit' && choices.length > 0 && (")
    modal_close = text.index("        </Modal>", action_start)
    action_component = """          {modalMode === 'edit' && (
            <WorkflowActionPanel
              choices={choices}
              action={action}
              remarks={remarks}
              departmentAction={departmentAction}
              busy={busy}
              finance={finance}
              department={department}
              onActionChange={setAction}
              onRemarksChange={setRemarks}
              onSave={() => void save()}
            />
          )}
"""
    text = text[:action_start] + action_component + text[modal_close:]

    bottom_start = text.find('\nfunction QueueHealthCard(')
    if bottom_start != -1:
        text = text[:bottom_start].rstrip() + '\n'

    path.write_text(text)


def add_access_policies() -> None:
    path = Path('server/domain/access.ts')
    text = path.read_text()
    text = replace_once(
        text,
        "export const administrativeRoles: string[] = ['super_administrator', 'administrator'];\n",
        """export const administrativeRoles: string[] = ['super_administrator', 'administrator'];
export const financeRoles: string[] = ['super_administrator', 'finance_reviewer'];
export const departmentDecisionRoles: string[] = [
  ...administrativeRoles,
  'department_approver',
];
""",
        'access role policies',
    )
    path.write_text(text)

    Path('server/domain/access.test.ts').write_text("""import assert from 'node:assert/strict';
import test from 'node:test';
import { administrativeRoles, departmentDecisionRoles, financeRoles } from './access.ts';

test('Finance authority excludes the legacy administrator role', () => {
  assert.deepEqual(financeRoles, ['super_administrator', 'finance_reviewer']);
  assert.equal(financeRoles.includes('administrator'), false);
});

test('department decisions keep administrator compatibility without granting Finance authority', () => {
  assert.equal(administrativeRoles.includes('administrator'), true);
  assert.equal(departmentDecisionRoles.includes('department_approver'), true);
  assert.equal(departmentDecisionRoles.includes('administrator'), true);
});
""")


def split_staff_routes() -> None:
    path = Path('server/routes/staff.ts')
    text = path.read_text()
    digital_start = text.index("  if (route.startsWith('digital-rfp/')) {")
    audit_start = text.index("  if (route === 'audit-trail') {")
    finance_start = text.index("  if (route === 'finance/action') {")
    department_start = text.index("  if (route === 'department/action') {")
    attachment_start = text.index("  if (route === 'request-attachments') {")
    handler_end = text.rfind('\n};')

    digital_chunk = text[digital_start:audit_start]
    monitoring_chunk = text[audit_start:finance_start]
    finance_chunk = text[finance_start:department_start]
    department_chunk = text[department_start:attachment_start]
    attachment_chunk = text[attachment_start:handler_end]

    route_root = Path('server/routes/staff')
    route_root.mkdir(parents=True, exist_ok=True)

    table_map = """const tableMap: Record<string, { table: string; order: string; roles?: string[] }> = {
  requests: { table: 'rfp_requests', order: 'submitted_at' },
  forms: { table: 'form_responses', order: 'source_timestamp', roles: administrativeRoles },
  logs: { table: 'approval_logs', order: 'occurred_at' },
  flow: { table: 'process_flow_steps', order: 'display_order' },
  documents: {
    table: 'request_attachments',
    order: 'created_at',
    roles: [...administrativeRoles, 'finance_reviewer'],
  },
};

"""
    (route_root / 'monitoring.ts').write_text(
        """import { z } from 'zod';
import { administrativeRoles } from '../../domain/access.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json } from '../../lib/http.js';
import { isDepartmentOnly } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import { auditTrailRow } from '../../services/audit-trail.js';
import type { RouteHandler } from '../context.js';

"""
        + table_map
        + "export const handleMonitoringRoutes: RouteHandler = async ({ event, route, db }) => {\n"
        + monitoring_chunk
        + "\n  return undefined;\n};\n"
    )

    finance_chunk = finance_chunk.replace(
        "requireStaff(event, ['super_administrator', 'finance_reviewer'])",
        'requireStaff(event, financeRoles)',
    )
    (route_root / 'finance.ts').write_text(
        """import { financeRoles } from '../../domain/access.js';
import { flushEmailQueueForRequest } from '../../email/service.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { financeSchema, financeUpdateSchema } from '../../lib/validation.js';
import {
  isFinanceStageAction,
  performFinanceStageAction,
} from '../../services/finance-stage-workflow.js';
import type { RouteHandler } from '../context.js';

export const handleFinanceRoutes: RouteHandler = async ({ event, route, db }) => {
"""
        + finance_chunk
        + "\n  return undefined;\n};\n"
    )

    department_chunk = department_chunk.replace(
        "requireStaff(event, [...administrativeRoles, 'department_approver'])",
        'requireStaff(event, departmentDecisionRoles)',
    )
    (route_root / 'department.ts').write_text(
        """import { administrativeRoles, departmentDecisionRoles } from '../../domain/access.js';
import { flushEmailQueueForRequest } from '../../email/service.js';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { normalizeDepartment } from '../../lib/staff-access.js';
import { departmentRereviewSchema } from '../../lib/validation.js';
import { cancelPendingDepartmentReview } from '../../services/workflow-notifications.js';
import type { RouteHandler } from '../context.js';

export const handleDepartmentRoutes: RouteHandler = async ({ event, route, db }) => {
"""
        + department_chunk
        + "\n  return undefined;\n};\n"
    )

    (route_root / 'attachments.ts').write_text(
        """import { z } from 'zod';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { isDepartmentOnly, normalizeDepartment } from '../../lib/staff-access.js';
import { getAssignedDepartments } from '../../services/approving-heads.js';
import type { RouteHandler } from '../context.js';

export const handleAttachmentRoutes: RouteHandler = async ({ event, route, db }) => {
"""
        + digital_chunk
        + attachment_chunk
        + "\n};\n"
    )

    path.write_text("""import { requireStaff } from '../lib/auth.js';
import { ensureMethod, json } from '../lib/http.js';
import { handleAttachmentRoutes } from './staff/attachments.js';
import { handleDashboardRoute } from './staff/dashboard.js';
import { handleDepartmentRoutes } from './staff/department.js';
import { handleFinanceRoutes } from './staff/finance.js';
import { handleMonitoringRoutes } from './staff/monitoring.js';
import type { RouteHandler } from './context.js';

const staffRouteHandlers: RouteHandler[] = [
  handleDashboardRoute,
  handleAttachmentRoutes,
  handleMonitoringRoutes,
  handleFinanceRoutes,
  handleDepartmentRoutes,
];

export const handleStaffRoutes: RouteHandler = async (context) => {
  const { event, route } = context;
  if (route === 'me') {
    ensureMethod(event, 'GET');
    const staff = await requireStaff(event);
    return json(200, {
      ok: true,
      user: { id: staff.user.id, email: staff.user.email },
      roles: staff.roles,
      profile: staff.profile,
    });
  }

  for (const handler of staffRouteHandlers) {
    const response = await handler(context);
    if (response) return response;
  }
  return undefined;
};
""")


def add_architecture_regression_test() -> None:
    Path('scripts/verification/architecture.test.ts').write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const lineCount = (path: string) => read(path).split(/\\r?\\n/).length;

test('staff route stays a thin dispatcher', () => {
  const staff = read('server/routes/staff.ts');
  assert.ok(lineCount('server/routes/staff.ts') <= 70, 'staff.ts should remain a thin dispatcher');
  for (const route of ['finance/action', 'finance/update', 'department/action', 'audit-trail']) {
    assert.equal(staff.includes(route), false, `${route} must stay in a focused route module`);
  }
});

test('approval workspace stays feature-oriented', () => {
  assert.ok(
    lineCount('src/pages/ApprovalsPage.tsx') <= 750,
    'ApprovalsPage.tsx should compose feature modules instead of becoming a god component',
  );
  for (const path of [
    'src/features/approvals/workflow.ts',
    'src/features/approvals/ApprovalQueueFilters.tsx',
    'src/features/approvals/ApprovalQueueTable.tsx',
    'src/features/approvals/FinanceUpdateForm.tsx',
    'server/routes/staff/finance.ts',
    'server/routes/staff/monitoring.ts',
    'server/routes/staff/attachments.ts',
  ]) {
    assert.ok(read(path).length > 0, `${path} must exist`);
  }
});
""")

    package_path = Path('package.json')
    package = json.loads(package_path.read_text())
    test_command = package['scripts']['test']
    additions = [
        'server/domain/access.test.ts',
        'scripts/verification/architecture.test.ts',
    ]
    for addition in additions:
        if addition not in test_command:
            test_command += f' {addition}'
    package['scripts']['test'] = test_command
    package_path.write_text(json.dumps(package, indent=2) + '\n')


def update_architecture_docs() -> None:
    path = Path('docs/ARCHITECTURE.md')
    text = path.read_text().rstrip()
    text += """

## Current feature boundaries

- `src/features/approvals/` owns Finance queue filtering, table presentation, SLA presentation, Finance receipt editing, and workflow-action UI.
- `server/routes/staff/finance.ts` owns Finance action/update HTTP endpoints and uses the central `financeRoles` policy.
- `server/routes/staff/monitoring.ts` owns monitoring, audit-trail, and document-registry reads.
- `server/routes/staff/department.ts` owns Department Head decisions.
- `server/routes/staff/attachments.ts` owns Digital RFP retrieval and attachment signing/preview endpoints.
- `server/routes/staff.ts` is intentionally only a dispatcher plus the signed-in staff identity endpoint.

Architecture regression tests enforce these boundaries and keep the largest dispatcher/page files below agreed size limits.
"""
    path.write_text(text + '\n')


write_approval_feature_modules()
refactor_approvals_page()
add_access_policies()
split_staff_routes()
add_architecture_regression_test()
update_architecture_docs()
