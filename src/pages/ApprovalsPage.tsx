import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Printer, RefreshCw } from 'lucide-react';
import { Button, Modal, Spinner, StatusBadge } from '../components/ui';
import { useAuth } from '../components/AuthProvider';
import { get, post } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import type { RfpRequest } from '../types';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
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
} from '../features/approvals/workflow';
import { AttachmentPreviewSection } from '../components/AttachmentPreviewSection';
import {
  DigitalRfpReceipt,
  type DigitalRfpAttachment,
  type DigitalRfpOperations,
  type DigitalRfpWorkflow,
} from '../components/DigitalRfpReceipt';
import { normalizeFinanceReceipt } from '../../shared/contracts/digital-rfp';

type Result = { rows: RfpRequest[] };
type ReceiptData = { request: RfpRequest; attachments: DigitalRfpAttachment[] };
type ModalMode = 'view' | 'edit';

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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [queueFocus, setQueueFocus] = useState<QueueFocus>('all');
  const [now, setNow] = useState(() => Date.now());
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [originalsDate, setOriginalsDate] = useState('');
  const [documentVerification, setDocumentVerification] = useState('');
  const [verificationRemarks, setVerificationRemarks] = useState('');
  const [financeNotes, setFinanceNotes] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [lateDocuments, setLateDocuments] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode>('view');
  const [receiptData, setReceiptData] = useState<ReceiptData>();
  const [receiptLoading, setReceiptLoading] = useState(false);
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
  const finance = roles.some((role) => ['super_administrator', 'finance_reviewer'].includes(role));
  const financeHead = roles.includes('super_administrator');
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
          ) || processingOverdue(request, now)
        );
      return true;
    },
    [now, queueFocus],
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(
      (request) =>
        (!company || request.company === company) &&
        (!statusFilter || request.final_status === statusFilter) &&
        (!fromDate || manilaDay(request.submitted_at || 0) >= fromDate) &&
        (!toDate || manilaDay(request.submitted_at || 0) <= toDate) &&
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
  }, [company, fromDate, matchesQueueFocus, rows, search, statusFilter, toDate, view]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const paginatedRows = useMemo(
    () => visibleRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleRows],
  );
  useEffect(() => {
    setPage(1);
  }, [company, fromDate, pageSize, queueFocus, search, statusFilter, toDate, view]);
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
      processing: activeRows.filter((request) =>
        ['Processing', 'Check Preparation', 'Check Approval', 'Awaiting Signatory'].includes(
          request.final_status,
        ),
      ).length,
      overdue: activeRows.filter((request) => processingOverdue(request, now)).length,
    };
  }, [now, rows]);
  const hasFilters = Boolean(
    company || search || statusFilter || fromDate || toDate || queueFocus !== 'all',
  );
  const applyQueueFocus = (focus: QueueFocus) => {
    setQueueFocus((current) => (current === focus ? 'all' : focus));
    setView('pending');
  };
  const clearFilters = () => {
    setCompany('');
    setSearch('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setQueueFocus('all');
  };
  const openRequest = (request: RfpRequest, mode: ModalMode = 'view') => {
    const operations = financeOperations(request);
    const receipt = normalizeFinanceReceipt(request.raw_record, {
      finalStatus: request.final_status,
      plannedCheckDate: request.planned_check_date,
    });
    setSelected(request);
    setModalMode(mode);
    setReceiptData(undefined);
    setAction('');
    setRemarks('');
    setCheckDate(request.planned_check_date || '');
    setReason('');
    setOriginalsDate(operations.originals_received_date || '');
    setDocumentVerification(operations.document_verification || '');
    setVerificationRemarks(operations.verification_remarks || '');
    setFinanceNotes(request.finance_remarks || '');
    setCheckNumber(receipt.processing.checkNumber || '');
    setPaymentReference(receipt.processing.paymentReference || '');
    setProcessingStatus(receipt.processing.status || '');
    setLateDocuments(receipt.lateDocuments.join('\n'));
    setNotice('');
    setError('');
    if (finance || mode === 'view') {
      setReceiptLoading(true);
      get<ReceiptData>(`digital-rfp/${encodeURIComponent(request.id)}`)
        .then((result) => setReceiptData(result))
        .catch((cause) => setError(cause.message))
        .finally(() => setReceiptLoading(false));
    }
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
        checkNumber: checkNumber || null,
        paymentReference: paymentReference || null,
        processingStatus: processingStatus || null,
        lateDocuments: lateDocuments
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setRows((current) =>
        current.map((request) => (request.id === result.request.id ? result.request : request)),
      );
      openRequest(result.request);
      setNotice('Digital RFP receipt saved and added to the approval log.');
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
        <FinanceQueueHealth
          queueFocus={queueFocus}
          counts={queueCounts}
          onFocus={applyQueueFocus}
        />
      )}

      <ApprovalQueueFilters
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
      <ApprovalQueueTable
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
      {selected && (
        <Modal
          title={`Digital RFP · ${selected.rfp_number}`}
          size="wide"
          onClose={() => setSelected(undefined)}
        >
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
                <>
                  <Button
                    variant="secondary"
                    onClick={() => openRequest(selected, modalMode === 'view' ? 'edit' : 'view')}
                  >
                    {modalMode === 'view' ? <Pencil size={16} /> : <Eye size={16} />}
                    {modalMode === 'view' ? 'Edit receipt' : 'View receipt'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      window.open(
                        `/admin/rfp/${selected.id}/print`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    <Printer size={16} />
                    Print
                  </Button>
                </>
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
          {modalMode === 'view' && finance ? (
            receiptLoading ? (
              <div className="grid min-h-64 place-items-center">
                <Spinner label="Loading receipt" />
              </div>
            ) : receiptData ? (
              <div className="finance-receipt-preview">
                <DigitalRfpReceipt
                  request={receiptData.request}
                  attachments={receiptData.attachments}
                  workflow={
                    (receiptData.request.raw_record?.finance_workflow || {}) as DigitalRfpWorkflow
                  }
                  financeOperations={
                    (receiptData.request.raw_record?.finance_operations ||
                      {}) as DigitalRfpOperations
                  }
                  financeReceipt={normalizeFinanceReceipt(receiptData.request.raw_record, {
                    finalStatus: receiptData.request.final_status,
                    plannedCheckDate: receiptData.request.planned_check_date,
                  })}
                  submissionChecklist={receiptData.request.raw_record?.submission_checklist || []}
                />
              </div>
            ) : null
          ) : (
            <>
              <h3 className="finance-section-title">Request overview</h3>
              <div className="finance-detail-grid finance-detail-grid-compact">
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
                      [
                        'Purpose',
                        'Approving heads',
                        'Department remarks',
                        'Finance remarks',
                      ].includes(key)
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
            </>
          )}
          {finance && modalMode === 'edit' && (
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
          {modalMode === 'edit' && (
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
        </Modal>
      )}
    </div>
  );
}
