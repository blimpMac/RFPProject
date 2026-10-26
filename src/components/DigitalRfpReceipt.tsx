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
  const typeOfRequest = request.request_type || request.raw_record?.request_type || 'Not recorded';
  const paymentMethod = request.raw_record?.payment_method || 'Not recorded';

  return (
    <article className="digital-rfp-sheet" aria-label={`Digital RFP ${request.rfp_number}`}>
      <header className="digital-rfp-header">
        <div className="digital-rfp-brand">
          <img src={brand.logo} alt={`${brand.name} logo`} />
          <span>{request.company || brand.name}</span>
        </div>
        <div className="digital-rfp-title">
          <h1>REQUEST FOR PAYMENT</h1>
          <p>Digital RFP · System Generated</p>
        </div>
        <div className="digital-rfp-number">
          <span>RFP NUMBER</span>
          <strong>{request.rfp_number}</strong>
          <small>{value(request.final_status)}</small>
        </div>
      </header>

      <ReceiptSection title="1. Request details">
        <div className="digital-rfp-detail-grid">
          <Detail label="Requestor" value={request.requestor_name} />
          <Detail label="Department" value={request.department} />
          <Detail label="Date filed" value={manilaDate(request.submitted_at, true)} />
          <Detail label="Company" value={request.company || brand.name} />
          <Detail label="Type" value={request.rfp_type} />
          <Detail label="Type of request" value={typeOfRequest} />
          <Detail label="Payee / supplier" value={request.supplier_payee} />
          <Detail label="Payment method" value={paymentMethod} />
          <Detail label="Amount" value={php.format(request.amount)} strong />
          <Detail
            label="Requested payment date"
            value={manilaDate(request.required_payment_date)}
          />
          <Detail label="Project / cost center" value={request.project_class} />
          <Detail label="Purpose" value={request.purpose_description} wide />
        </div>
      </ReceiptSection>

      <ReceiptSection title="2. Required and received documents">
        <div className="digital-rfp-document-columns">
          <DocumentGroup title="Required checklist">
            {requirements.length ? (
              requirements.flatMap((group) =>
                group.items.map((item) => (
                  <li key={`${group.label}-${item}`}>
                    <span>{selected.has(item.toLowerCase()) ? '✓' : '□'}</span>
                    <div>
                      <strong>{item}</strong>
                      <small>{group.label}</small>
                    </div>
                  </li>
                )),
              )
            ) : (
              <li>No static checklist is configured for this request type.</li>
            )}
          </DocumentGroup>
          <DocumentGroup title="Uploaded soft copies">
            {availableAttachments.length ? (
              availableAttachments.map((attachment) => (
                <li key={attachment.id}>
                  <span>✓</span>
                  <strong>{attachment.original_filename}</strong>
                </li>
              ))
            ) : (
              <li>No soft-copy attachment was submitted.</li>
            )}
          </DocumentGroup>
          <DocumentGroup title="Late documents received">
            {receipt.lateDocuments.length ? (
              receipt.lateDocuments.map((document) => (
                <li key={document}>
                  <span>+</span>
                  <strong>{document}</strong>
                </li>
              ))
            ) : (
              <li>No late documents recorded.</li>
            )}
          </DocumentGroup>
        </div>
        <div className="digital-rfp-document-status">
          <strong>Finance document status</strong>
          <span>{receipt.hardCopy.status || 'Pending verification'}</span>
          <p>{receipt.hardCopy.remarks || 'No verification remarks recorded.'}</p>
        </div>
      </ReceiptSection>

      <ReceiptSection title="3. Approval path">
        <div className="digital-rfp-approval-table" role="table" aria-label="Approval path">
          <ApprovalRow
            stage="Requestor"
            actor={`${request.requestor_name}${request.requestor_email ? ` · ${request.requestor_email}` : ''}`}
            status="Submitted"
            date={request.submitted_at}
            remarks="Request filed"
          />
          <ApprovalRow
            stage="Department Head"
            actor={request.approving_head}
            status={request.department_approval}
            date={request.department_approval_at}
            remarks={request.department_approval_remarks}
          />
          <ApprovalRow
            stage="Finance Member"
            actor={workflow.member_reviewed_by}
            status={workflow.member_status || request.finance_review}
            date={workflow.member_reviewed_at || request.finance_review_at}
            remarks={request.finance_remarks}
          />
          <ApprovalRow
            stage="Finance Head"
            actor={workflow.head_reviewed_by}
            status={workflow.head_status || 'Pending'}
            date={workflow.head_reviewed_at}
            remarks={request.finance_remarks}
          />
        </div>
      </ReceiptSection>

      <ReceiptSection title="4. Finance hard-copy verification">
        <div className="digital-rfp-detail-grid">
          <Detail label="Date received" value={manilaDate(receipt.hardCopy.receivedDate)} />
          <Detail label="Document status" value={receipt.hardCopy.status || 'Pending'} strong />
          <Detail label="Verified by" value={value(receipt.hardCopy.verifiedBy)} />
          <Detail label="Verified date" value={manilaDate(receipt.hardCopy.verifiedAt, true)} />
          <Detail label="Remarks" value={value(receipt.hardCopy.remarks)} wide />
        </div>
      </ReceiptSection>

      <ReceiptSection title="5. Finance approval and processing">
        <div className="digital-rfp-processing-grid">
          <Detail label="Finance approver" value={value(receipt.processing.approvedBy)} />
          <Detail label="Approval date" value={manilaDate(receipt.processing.approvedAt, true)} />
          <Detail
            label="Processing started"
            value={manilaDate(workflow.processing_started_at, true)}
          />
          <Detail label="3-day deadline" value={manilaDate(workflow.processing_due_at, true)} />
          <Detail label="Target release" value={manilaDate(receipt.processing.targetReleaseDate)} />
          <Detail label="Current status" value={processStatus} strong />
          <Detail label="Check number" value={value(receipt.processing.checkNumber)} />
          <Detail label="Payment reference" value={value(receipt.processing.paymentReference)} />
        </div>
      </ReceiptSection>

      <footer className="digital-rfp-footer">
        System-generated record · Printed {manilaDate(new Date().toISOString(), true)} · Asia/Manila
      </footer>
    </article>
  );
}

function ReceiptSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="digital-rfp-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Detail({
  label,
  value: detailValue,
  strong = false,
  wide = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`digital-rfp-detail${wide ? ' digital-rfp-detail-wide' : ''}`}>
      <span>{label}</span>
      {strong ? <strong>{detailValue}</strong> : <p>{detailValue}</p>}
    </div>
  );
}

function DocumentGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="digital-rfp-document-group">
      <h3>{title}</h3>
      <ul>{children}</ul>
    </div>
  );
}

function ApprovalRow({
  stage,
  actor,
  status,
  date,
  remarks,
}: {
  stage: string;
  actor?: string | null;
  status?: string | null;
  date?: string | null;
  remarks?: string | null;
}) {
  return (
    <div className="digital-rfp-approval-row" role="row">
      <strong role="cell">{stage}</strong>
      <span role="cell">{value(actor, 'Not yet assigned')}</span>
      <span role="cell">{value(status, 'Pending')}</span>
      <span role="cell">{manilaDate(date, true)}</span>
      <span role="cell">{value(remarks)}</span>
    </div>
  );
}
