import { documentRequirementsFor } from '../../shared/constants/document-requirements';
import {
  companyBrand,
  normalizeFinanceReceipt,
  type FinanceReceipt,
} from '../../shared/contracts/digital-rfp';
import { manilaDate, php } from '../lib/format';

export type DigitalRfpWorkflow = {
  member_status?: string | null;
  member_reviewed_at?: string | null;
  member_reviewed_by?: string | null;
  head_status?: string | null;
  head_reviewed_at?: string | null;
  head_reviewed_by?: string | null;
  hard_copy_status?: string | null;
  hard_copy_approved_at?: string | null;
  hard_copy_approved_by?: string | null;
  processing_started_at?: string | null;
  processing_due_at?: string | null;
};

export type DigitalRfpOperations = {
  originals_received_date?: string | null;
  document_verification?: string | null;
  verification_remarks?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type DigitalRfpRequest = {
  id: string;
  rfp_number: string;
  submitted_at: string | null;
  requestor_name: string;
  requestor_email?: string | null;
  company: string | null;
  department: string;
  project_class: string;
  rfp_type: string;
  request_type?: string | null;
  raw_record?: { request_type?: string | null; payment_method?: string | null } | null;
  supplier_payee: string;
  purpose_description: string;
  amount: number;
  required_payment_date: string;
  approving_head: string;
  department_approval: string;
  department_approval_at?: string | null;
  department_approval_remarks?: string | null;
  finance_review: string;
  finance_review_at?: string | null;
  finance_remarks?: string | null;
  final_status: string;
  planned_check_date?: string | null;
};

export type DigitalRfpAttachment = {
  id: string;
  original_filename: string;
  status?: string;
};

const value = (input: string | null | undefined, fallback = '—') => input?.trim() || fallback;

const financeStages = [
  { label: 'For Processing', statuses: ['Processing', 'Payment Processing'] },
  { label: 'Check Preparation', statuses: ['Check Preparation'] },
  { label: 'Check Approval', statuses: ['Check Approval', 'Awaiting Signatory'] },
  { label: 'Check Released', statuses: ['Check Released'] },
  { label: 'Paid', statuses: ['Paid', 'Payment Released'] },
];

function stageIndex(status: string) {
  return financeStages.findIndex((stage) => stage.statuses.includes(status));
}

function statusClass(status?: string | null) {
  const text = String(status || '').toLowerCase();
  if (/approved|submitted|paid|released|complete/.test(text)) return 'is-approved';
  if (/returned|rejected|declined|incomplete|overdue/.test(text)) return 'is-returned';
  return 'is-pending';
}

export function DigitalRfpReceipt({
  request,
  attachments,
  workflow = {},
  financeOperations = {},
  financeReceipt,
  submissionChecklist = [],
}: {
  request: DigitalRfpRequest;
  attachments: DigitalRfpAttachment[];
  workflow?: DigitalRfpWorkflow;
  financeOperations?: DigitalRfpOperations;
  financeReceipt?: FinanceReceipt;
  submissionChecklist?: string[];
}) {
  const brand = companyBrand(request.company);
  const receipt =
    financeReceipt ||
    normalizeFinanceReceipt(
      { finance_operations: financeOperations, finance_workflow: workflow },
      { finalStatus: request.final_status, plannedCheckDate: request.planned_check_date },
    );
  const processingOverdue = Boolean(
    workflow.processing_due_at &&
    new Date(workflow.processing_due_at).getTime() < Date.now() &&
    !/paid|completed/i.test(request.final_status),
  );
  const processStatus = processingOverdue
    ? 'Overdue'
    : receipt.processing.status || request.final_status;
  const availableAttachments = attachments.filter((attachment) => attachment.status !== 'deleted');
  const requirements = documentRequirementsFor(request.rfp_type);
  const selected = new Set(submissionChecklist.map((item) => item.toLowerCase()));
  const documentItems = requirements.flatMap((group) => group.items).slice(0, 6);
  const typeOfRequest = request.request_type || request.raw_record?.request_type || 'Not recorded';
  const paymentMethod = request.raw_record?.payment_method || 'Not recorded';
  const currentFinanceStage = stageIndex(request.final_status);

  return (
    <article className="digital-rfp-sheet" aria-label={`Digital RFP ${request.rfp_number}`}>
      <header className="digital-rfp-header">
        <div className="digital-rfp-brand">
          <img src={brand.logo} alt={`${brand.name} logo`} />
        </div>
        <div className="digital-rfp-title">
          <h1>REQUEST FOR PAYMENT (RFP)</h1>
          <p>Digital RFP – System Generated</p>
        </div>
        <div className="digital-rfp-number-block">
          <div className="digital-rfp-number">
            <span>RFP No.</span>
            <strong>{request.rfp_number}</strong>
          </div>
          <div className="digital-rfp-view-badge">
            <strong>VIEW</strong>
            <span>IN SYSTEM</span>
          </div>
        </div>
      </header>

      <ReceiptSection title="1. Request details">
        <div className="digital-rfp-reference-grid">
          <div>
            <ReferenceRow label="Requesting Department" value={request.department} />
            <ReferenceRow label="Requestor" value={request.requestor_name} />
            <ReferenceRow label="Payee / Supplier" value={request.supplier_payee} />
            <ReferenceRow label="Purpose" value={request.purpose_description} />
            <ReferenceRow label="Project / Cost Center" value={request.project_class} />
            <ReferenceRow label="Company" value={request.company || brand.name} />
          </div>
          <div>
            <ReferenceRow label="Date Filed" value={manilaDate(request.submitted_at, true)} />
            <ReferenceRow label="Type" value={request.rfp_type} />
            <ReferenceRow label="Type of Request" value={typeOfRequest} />
            <ReferenceRow label="Payment Method" value={paymentMethod} />
            <ReferenceRow label="Amount" value={php.format(request.amount)} strong />
            <ReferenceRow
              label="Requested Payment Date"
              value={manilaDate(request.required_payment_date)}
            />
          </div>
        </div>
      </ReceiptSection>

      <div className="digital-rfp-middle-grid">
        <ReceiptSection title="2. Attached documents (soft copy)" compact>
          <div className="digital-rfp-checklist">
            {documentItems.length ? (
              documentItems.map((item) => (
                <CheckItem key={item} label={item} checked={selected.has(item.toLowerCase())} />
              ))
            ) : (
              <CheckItem label="Supporting document" checked={availableAttachments.length > 0} />
            )}
          </div>
          <div className="digital-rfp-document-note">
            {availableAttachments.length} uploaded file
            {availableAttachments.length === 1 ? '' : 's'}
            {receipt.lateDocuments.length
              ? ` · ${receipt.lateDocuments.length} late document${receipt.lateDocuments.length === 1 ? '' : 's'}`
              : ''}
          </div>
        </ReceiptSection>

        <ReceiptSection title="3. Approval status" compact>
          <div className="digital-rfp-approval-strip">
            <ApprovalCard
              stage="Requestor"
              actor={request.requestor_name}
              date={request.submitted_at}
              status="Submitted"
            />
            <ApprovalCard
              stage="Department Head"
              actor={request.approving_head}
              date={request.department_approval_at}
              status={request.department_approval}
            />
            <ApprovalCard
              stage="Finance Member"
              actor={workflow.member_reviewed_by}
              date={workflow.member_reviewed_at || request.finance_review_at}
              status={workflow.member_status || request.finance_review}
            />
            <ApprovalCard
              stage="Finance Head"
              actor={workflow.head_reviewed_by}
              date={workflow.head_reviewed_at}
              status={workflow.head_status || 'Pending'}
            />
          </div>
        </ReceiptSection>
      </div>

      <ReceiptSection title="4. Finance – hard-copy document verification (for Finance use only)">
        <div className="digital-rfp-hardcopy-grid">
          <div className="digital-rfp-hardcopy-column">
            <LineField label="Date Received" value={manilaDate(receipt.hardCopy.receivedDate)} />
            <div className="digital-rfp-status-line">
              <span>Document Status</span>
              <CheckItem label="Complete" checked={receipt.hardCopy.status === 'Complete'} />
              <CheckItem label="Incomplete" checked={receipt.hardCopy.status === 'Incomplete'} />
            </div>
            <LineField label="Remarks (if any)" value={value(receipt.hardCopy.remarks, '')} />
          </div>
          <div className="digital-rfp-hardcopy-column digital-rfp-hardcopy-signoff">
            <LineField label="Verified By" value={value(receipt.hardCopy.verifiedBy, '')} />
            <LineField label="Date" value={manilaDate(receipt.hardCopy.verifiedAt, true)} />
          </div>
        </div>
      </ReceiptSection>

      <ReceiptSection title="5. Finance approval and processing (for Finance use only)">
        <div className="digital-rfp-finance-grid">
          <ReferenceRow label="Finance Approver" value={value(receipt.processing.approvedBy)} />
          <ReferenceRow
            label="Approval Date"
            value={manilaDate(receipt.processing.approvedAt, true)}
          />
          <ReferenceRow
            label="Target Release Date"
            value={manilaDate(receipt.processing.targetReleaseDate)}
          />
        </div>
        <div className="digital-rfp-processing-row">
          <ReferenceRow
            label="Check No. / Payment Ref."
            value={
              [receipt.processing.checkNumber, receipt.processing.paymentReference]
                .filter(Boolean)
                .join(' / ') || '—'
            }
          />
          <div className="digital-rfp-processing-status">
            <span className="digital-rfp-processing-label">Status</span>
            {financeStages.map((stage, index) => (
              <CheckItem
                key={stage.label}
                label={stage.label}
                checked={currentFinanceStage >= 0 && index <= currentFinanceStage}
              />
            ))}
          </div>
        </div>
        <div className="digital-rfp-current-state">
          Current system status:{' '}
          <strong className={statusClass(processStatus)}>{processStatus}</strong>
        </div>
      </ReceiptSection>

      <footer className="digital-rfp-footer">
        System-generated record · {brand.name} · Printed{' '}
        {manilaDate(new Date().toISOString(), true)}
      </footer>
    </article>
  );
}

function ReceiptSection({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`digital-rfp-section${compact ? ' digital-rfp-section-compact' : ''}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ReferenceRow({
  label,
  value: detailValue,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="digital-rfp-reference-row">
      <span>{label}</span>
      {strong ? <strong>{detailValue}</strong> : <p>{detailValue}</p>}
    </div>
  );
}

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className="digital-rfp-check-item">
      <span className={`digital-rfp-box${checked ? ' is-checked' : ''}`} aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </span>
  );
}

function ApprovalCard({
  stage,
  actor,
  date,
  status,
}: {
  stage: string;
  actor?: string | null;
  date?: string | null;
  status?: string | null;
}) {
  return (
    <div className="digital-rfp-approval-card">
      <span>{stage}</span>
      <strong>{value(actor, 'Pending')}</strong>
      <small>{manilaDate(date, true)}</small>
      <em className={statusClass(status)}>{value(status, 'Pending').toUpperCase()}</em>
    </div>
  );
}

function LineField({ label, value: detailValue }: { label: string; value: string }) {
  return (
    <div className="digital-rfp-line-field">
      <span>{label}</span>
      <strong>{detailValue || ' '}</strong>
    </div>
  );
}
