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
  updated_by?: string | null;
};

export type DigitalRfpRequest = {
  id: string;
  rfp_number: string;
  submitted_at: string | null;
  requestor_name: string;
  company: string | null;
  department: string;
  project_class: string;
  rfp_type: string;
  request_type?: string | null;
  raw_record?: { request_type?: string | null } | null;
  supplier_payee: string;
  purpose_description: string;
  amount: number;
  required_payment_date: string;
  approving_head: string;
  department_approval: string;
  department_approval_at?: string | null;
  finance_review: string;
  final_status: string;
  planned_check_date?: string | null;
};

export type DigitalRfpAttachment = {
  id: string;
  original_filename: string;
  status?: string;
};

function companyLogo(company: string | null) {
  return /greenmetal|gemcor/i.test(company || '')
    ? '/brands/gemcor.png'
    : '/brands/greenlight-power.png';
}

function stageStatus(value: string | null | undefined, fallback = 'Pending') {
  return value?.trim() || fallback;
}

export function DigitalRfpReceipt({
  request,
  attachments,
  workflow = {},
  financeOperations = {},
  submissionChecklist = [],
}: {
  request: DigitalRfpRequest;
  attachments: DigitalRfpAttachment[];
  workflow?: DigitalRfpWorkflow;
  financeOperations?: DigitalRfpOperations;
  submissionChecklist?: string[];
}) {
  const processingOverdue = Boolean(
    workflow.processing_due_at &&
    new Date(workflow.processing_due_at).getTime() < Date.now() &&
    !/paid|completed/i.test(request.final_status),
  );
  const processStatus = processingOverdue ? 'Overdue' : request.final_status;
  const availableAttachments = attachments.filter((attachment) => attachment.status !== 'deleted');
  const typeOfRequest = request.request_type || request.raw_record?.request_type || 'Not recorded';

  return (
    <article className="digital-rfp-sheet" aria-label={`Digital RFP ${request.rfp_number}`}>
      <header className="digital-rfp-header">
        <div className="digital-rfp-brand">
          <img src={companyLogo(request.company)} alt={request.company || 'Company logo'} />
        </div>
        <div className="digital-rfp-title">
          <h1>REQUEST FOR PAYMENT (RFP)</h1>
          <p>Digital RFP – System Generated</p>
        </div>
        <div className="digital-rfp-number">
          <span>RFP No.</span>
          <strong>{request.rfp_number}</strong>
          <small>View in System</small>
        </div>
      </header>

      <section className="digital-rfp-section">
        <h2>1. REQUEST DETAILS</h2>
        <div className="digital-rfp-detail-grid">
          <Detail label="Requesting Department" value={request.department} />
          <Detail label="Date Filed" value={manilaDate(request.submitted_at, true)} />
          <Detail label="Requestor" value={request.requestor_name} />
          <Detail label="Type" value={request.rfp_type} />
          <Detail label="Type of Request" value={typeOfRequest} />
          <Detail label="Payee / Supplier" value={request.supplier_payee} />
          <Detail label="Amount" value={php.format(request.amount)} strong />
          <Detail label="Purpose" value={request.purpose_description} />
          <Detail
            label="Requested Payment Date"
            value={manilaDate(request.required_payment_date)}
          />
          <Detail label="Project / Cost Center" value={request.project_class} />
          <Detail label="Company" value={request.company || 'Not recorded'} />
        </div>
      </section>

      <div className="digital-rfp-two-column">
        <section className="digital-rfp-section">
          <h2>2. ATTACHED DOCUMENTS (Soft Copy)</h2>
          <div className="digital-rfp-document-list">
            {availableAttachments.length ? (
              availableAttachments.map((attachment) => (
                <span key={attachment.id}>☑ {attachment.original_filename}</span>
              ))
            ) : (
              <span>☐ No soft-copy attachment uploaded</span>
            )}
          </div>
          {submissionChecklist.length > 0 && (
            <div className="digital-rfp-checklist-note">
              <strong>Requestor checklist:</strong> {submissionChecklist.join(' • ')}
            </div>
          )}
        </section>

        <section className="digital-rfp-section">
          <h2>3. APPROVAL STATUS</h2>
          <div className="digital-rfp-approval-flow">
            <ApprovalCard
              label="Requestor"
              value={request.requestor_name}
              meta={manilaDate(request.submitted_at, true)}
            />
            <span className="digital-rfp-arrow">›</span>
            <ApprovalCard
              label="Department Head"
              value={request.approving_head}
              meta={`${request.department_approval} · ${manilaDate(request.department_approval_at, true)}`}
            />
            <span className="digital-rfp-arrow">›</span>
            <ApprovalCard
              label="Finance Member"
              value={stageStatus(workflow.member_status, request.finance_review)}
              meta={manilaDate(workflow.member_reviewed_at, true)}
            />
            <span className="digital-rfp-arrow">›</span>
            <ApprovalCard
              label="Finance Head"
              value={stageStatus(workflow.head_status)}
              meta={manilaDate(workflow.head_reviewed_at, true)}
            />
          </div>
        </section>
      </div>

      <section className="digital-rfp-section">
        <h2>4. FINANCE – HARD-COPY DOCUMENT VERIFICATION (For Finance Use Only)</h2>
        <div className="digital-rfp-detail-grid digital-rfp-verification-grid">
          <Detail
            label="Date Received"
            value={manilaDate(financeOperations.originals_received_date)}
          />
          <Detail label="Verified By" value={financeOperations.updated_by || '—'} />
          <Detail
            label="Document Status"
            value={financeOperations.document_verification || 'Pending'}
          />
          <Detail label="Manual Approval" value={stageStatus(workflow.hard_copy_status)} />
          <Detail
            label="Verification Remarks"
            value={financeOperations.verification_remarks || '—'}
          />
          <Detail label="Approval Date" value={manilaDate(workflow.hard_copy_approved_at, true)} />
        </div>
      </section>

      <section className="digital-rfp-section">
        <h2>5. FINANCE APPROVAL AND PROCESSING (For Finance Use Only)</h2>
        <div className="digital-rfp-processing-grid">
          <Detail label="Finance Head" value={stageStatus(workflow.head_status)} />
          <Detail label="Head Approval Date" value={manilaDate(workflow.head_reviewed_at, true)} />
          <Detail
            label="Processing Started"
            value={manilaDate(workflow.processing_started_at, true)}
          />
          <Detail label="3-Day Deadline" value={manilaDate(workflow.processing_due_at, true)} />
          <Detail label="Status" value={processStatus} strong />
          <Detail label="Target Release" value={manilaDate(request.planned_check_date)} />
        </div>
      </section>
    </article>
  );
}

function Detail({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="digital-rfp-detail">
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <p>{value}</p>}
    </div>
  );
}

function ApprovalCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="digital-rfp-approval-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}
