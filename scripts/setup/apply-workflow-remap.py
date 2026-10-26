from pathlib import Path
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Expected one regex match in {path}, found {count}: {pattern[:120]!r}')
    write(path, updated)


# -----------------------------------------------------------------------------
# New request-side attachment checklist.
# -----------------------------------------------------------------------------
write(
    'src/components/RequestAttachmentChecklist.tsx',
    r'''import { ClipboardCheck, Info } from 'lucide-react';

type ChecklistGroup = {
  label: string;
  items: string[];
};

type ChecklistPreset = {
  match: RegExp;
  groups: ChecklistGroup[];
};

const presets: ChecklistPreset[] = [
  {
    match: /trade supplier/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Signed / Approved Purchase Order',
          'Material Receiving Report',
          'Canvass Form',
          'Contract / warranty support, if applicable',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Delivery Receipt, if any', 'BIR / tax support, if applicable'],
      },
    ],
  },
  {
    match: /exclusive supplier/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Signed Purchase Order',
          'Canvass / sole-source support',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Delivery Receipt / Service Report'],
      },
    ],
  },
  {
    match: /subcon|subcontract/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Signed Purchase Order',
          'Approved Quotation / Contract',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Progress Billing / Accomplishment', 'Progress Report'],
      },
    ],
  },
  {
    match: /ttc|tcc/i,
    groups: [
      {
        label: 'Internal documents',
        items: ['Approved Request for Payment Form', 'Approved billing / request support'],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Official Receipt / supporting copy'],
      },
    ],
  },
  {
    match: /open payment.*agency|agency/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Approved authority / officer endorsement',
          'Signed Contract',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice / agency billing', 'Official Receipt, if available'],
      },
    ],
  },
  {
    match: /reimbursement/i,
    groups: [
      {
        label: 'Internal documents',
        items: ['Approved Request for Payment Form', 'Proof of payment'],
      },
      {
        label: 'External documents',
        items: ['Invoice / receipt', 'Other supporting proof, as applicable'],
      },
    ],
  },
  {
    match: /non.?po|open.*transaction/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Department Head approval',
          'Signed Contract / supporting agreement',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Delivery Receipt, if any', 'Contract / external support'],
      },
    ],
  },
  {
    match: /cash advance(?!.*liquid)/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Budget Estimate / allocation breakdown',
          'Service Request / activity support',
        ],
      },
      {
        label: 'External documents',
        items: ['Quotation / supporting invoice, if available'],
      },
    ],
  },
  {
    match: /liquidation|liquidate/i,
    groups: [
      {
        label: 'Internal documents',
        items: ['Approved Expense Summary', 'Proof of return of excess funds, if any'],
      },
      {
        label: 'External documents',
        items: ['Invoices / receipts', 'Acknowledgement / liquidation support'],
      },
    ],
  },
];

const fallbackGroups: ChecklistGroup[] = [
  {
    label: 'Suggested documents',
    items: [
      'Approved Request for Payment Form',
      'Invoice / billing support',
      'Purchase Order / contract, if applicable',
      'Proof of receipt / completion, if applicable',
    ],
  },
];

function groupsForType(rfpType: string) {
  return presets.find((preset) => preset.match.test(rfpType))?.groups || fallbackGroups;
}

export function RequestAttachmentChecklist({
  rfpType,
  selected,
  onChange,
}: {
  rfpType: string;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  if (!rfpType) return null;
  const groups = groupsForType(rfpType);
  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item]);

  return (
    <section className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#315c93] shadow-sm dark:bg-slate-800">
            <ClipboardCheck size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Suggested attachment checklist</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Optional reminder for {rfpType}. Check items as you prepare them; this does not
              validate the uploaded file type.
            </p>
          </div>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
          Optional
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
            <div className="mt-2 space-y-2">
              {group.items.map((item) => (
                <label
                  key={item}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <input
                    className="mt-0.5"
                    type="checkbox"
                    checked={selected.includes(item)}
                    onChange={() => toggle(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 flex gap-2 text-xs leading-5 text-slate-500">
        <Info className="mt-0.5 shrink-0" size={14} />
        Your department or Finance team may still request other documents based on the transaction.
      </p>
    </section>
  );
}
''',
)


# -----------------------------------------------------------------------------
# Reusable digital RFP receipt and finance print page.
# -----------------------------------------------------------------------------
write(
    'src/components/DigitalRfpReceipt.tsx',
    r'''import { manilaDate, php } from '../lib/format';

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
          <Detail label="Payment Type" value={request.rfp_type} />
          <Detail label="Payee / Supplier" value={request.supplier_payee} />
          <Detail label="Amount" value={php.format(request.amount)} strong />
          <Detail label="Purpose" value={request.purpose_description} />
          <Detail label="Requested Payment Date" value={manilaDate(request.required_payment_date)} />
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
          <Detail
            label="Manual Approval"
            value={stageStatus(workflow.hard_copy_status)}
          />
          <Detail
            label="Verification Remarks"
            value={financeOperations.verification_remarks || '—'}
          />
          <Detail
            label="Approval Date"
            value={manilaDate(workflow.hard_copy_approved_at, true)}
          />
        </div>
      </section>

      <section className="digital-rfp-section">
        <h2>5. FINANCE APPROVAL AND PROCESSING (For Finance Use Only)</h2>
        <div className="digital-rfp-processing-grid">
          <Detail label="Finance Head" value={stageStatus(workflow.head_status)} />
          <Detail label="Head Approval Date" value={manilaDate(workflow.head_reviewed_at, true)} />
          <Detail label="Processing Started" value={manilaDate(workflow.processing_started_at, true)} />
          <Detail label="3-Day Deadline" value={manilaDate(workflow.processing_due_at, true)} />
          <Detail label="Status" value={processStatus} strong />
          <Detail label="Target Release" value={manilaDate(request.planned_check_date)} />
        </div>
      </section>
    </article>
  );
}

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
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
''',
)

write(
    'src/pages/DigitalRfpPrintPage.tsx',
    r'''import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import {
  DigitalRfpReceipt,
  type DigitalRfpAttachment,
  type DigitalRfpOperations,
  type DigitalRfpWorkflow,
} from '../components/DigitalRfpReceipt';
import { Button, Spinner } from '../components/ui';
import { get } from '../lib/api';
import type { RfpRequest } from '../types';

type PrintData = {
  request: RfpRequest;
  attachments: DigitalRfpAttachment[];
};

export function DigitalRfpPrintPage() {
  const { id = '' } = useParams();
  const { roles, loading: authLoading } = useAuth();
  const [data, setData] = useState<PrintData>();
  const [error, setError] = useState('');
  const finance = roles.some((role) =>
    ['super_administrator', 'administrator', 'finance_reviewer'].includes(role),
  );

  useEffect(() => {
    if (!finance || !id) return;
    get<PrintData>(`digital-rfp/${encodeURIComponent(id)}`)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch((cause) => setError(cause.message));
  }, [finance, id]);

  if (authLoading) return <Spinner label="Checking Finance access" />;
  if (!finance) return <Navigate to="/admin" replace />;
  if (!data && !error)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Preparing digital RFP" />
      </div>
    );
  if (error)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-lg p-6 text-center">
          <h1 className="text-xl font-semibold">Digital RFP unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Link className="btn btn-secondary mt-4" to="/admin/approvals">
            Return to Finance
          </Link>
        </div>
      </main>
    );

  const request = data!.request;
  const workflow = (request.raw_record?.finance_workflow || {}) as DigitalRfpWorkflow;
  const financeOperations = (request.raw_record?.finance_operations || {}) as DigitalRfpOperations;
  const checklist = request.raw_record?.submission_checklist || [];

  return (
    <main className="digital-rfp-print-page">
      <div className="print-actions">
        <Link className="btn btn-secondary" to="/admin/approvals">
          <ArrowLeft size={16} />
          Back to Finance
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} />
          Print / Save PDF
        </Button>
      </div>
      <DigitalRfpReceipt
        request={request}
        attachments={data!.attachments}
        workflow={workflow}
        financeOperations={financeOperations}
        submissionChecklist={checklist}
      />
    </main>
  );
}
''',
)

write(
    'src/styles/digital-rfp.css',
    r'''.digital-rfp-print-page {
  min-height: 100vh;
  background: #eef2f6;
  padding: 1.5rem;
}

.print-actions {
  width: min(100%, 72rem);
  margin: 0 auto 1rem;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.digital-rfp-sheet {
  width: min(100%, 72rem);
  margin: 0 auto;
  background: #fff;
  color: #172033;
  border: 1px solid #c8d2dc;
  border-radius: 0.55rem;
  box-shadow: 0 18px 50px rgba(15, 39, 61, 0.1);
  overflow: hidden;
  font-size: 0.78rem;
}

.digital-rfp-header {
  display: grid;
  grid-template-columns: 1fr 1.35fr 0.75fr;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid #9eafbf;
}

.digital-rfp-brand img {
  display: block;
  max-width: 13rem;
  max-height: 4.25rem;
  object-fit: contain;
  object-position: left center;
}

.digital-rfp-title {
  text-align: center;
}

.digital-rfp-title h1 {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.1;
  font-weight: 800;
  color: #153653;
}

.digital-rfp-title p,
.digital-rfp-number small {
  margin: 0.25rem 0 0;
  color: #627385;
  font-size: 0.72rem;
}

.digital-rfp-number {
  justify-self: end;
  min-width: 10rem;
  border: 1px solid #c8d2dc;
  background: #f5f7f9;
  padding: 0.7rem 0.8rem;
}

.digital-rfp-number span,
.digital-rfp-number strong,
.digital-rfp-number small {
  display: block;
}

.digital-rfp-number span {
  font-weight: 700;
}

.digital-rfp-number strong {
  margin-top: 0.15rem;
  font-size: 0.95rem;
}

.digital-rfp-section {
  margin: 0.65rem 1rem;
  border: 1px solid #aebbc8;
  border-radius: 0.25rem;
  overflow: hidden;
}

.digital-rfp-section h2 {
  margin: 0;
  padding: 0.38rem 0.65rem;
  background: #153b59;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.digital-rfp-detail-grid,
.digital-rfp-processing-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.digital-rfp-processing-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.digital-rfp-detail {
  min-height: 2.2rem;
  display: grid;
  grid-template-columns: minmax(8rem, 0.75fr) minmax(0, 1.25fr);
  align-items: center;
  border-right: 1px solid #d4dbe2;
  border-bottom: 1px solid #d4dbe2;
}

.digital-rfp-detail span {
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0.35rem 0.55rem;
  background: #f1f4f7;
  font-weight: 600;
}

.digital-rfp-detail p,
.digital-rfp-detail strong {
  margin: 0;
  padding: 0.35rem 0.55rem;
  overflow-wrap: anywhere;
}

.digital-rfp-two-column {
  display: grid;
  grid-template-columns: 1fr 1.08fr;
}

.digital-rfp-two-column .digital-rfp-section:first-child {
  margin-right: 0.3rem;
}

.digital-rfp-two-column .digital-rfp-section:last-child {
  margin-left: 0.3rem;
}

.digital-rfp-document-list {
  min-height: 5rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 0.8rem;
  padding: 0.75rem;
}

.digital-rfp-document-list span {
  overflow-wrap: anywhere;
}

.digital-rfp-checklist-note {
  border-top: 1px solid #d4dbe2;
  padding: 0.55rem 0.75rem;
  color: #617181;
  font-size: 0.7rem;
  line-height: 1.45;
}

.digital-rfp-approval-flow {
  min-height: 6rem;
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: stretch;
  gap: 0.3rem;
  padding: 0.7rem;
}

.digital-rfp-approval-card {
  border: 1px solid #d4dbe2;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.45rem;
}

.digital-rfp-approval-card span {
  background: #edf2f6;
  margin: -0.45rem -0.45rem 0.4rem;
  padding: 0.28rem;
  font-weight: 700;
}

.digital-rfp-approval-card strong {
  font-size: 0.72rem;
}

.digital-rfp-approval-card small {
  margin-top: 0.2rem;
  color: #637484;
  font-size: 0.62rem;
}

.digital-rfp-arrow {
  align-self: center;
  color: #8293a3;
  font-size: 1.7rem;
  font-weight: 700;
}

@media (max-width: 800px) {
  .digital-rfp-header,
  .digital-rfp-two-column,
  .digital-rfp-processing-grid {
    grid-template-columns: 1fr;
  }

  .digital-rfp-title {
    text-align: left;
  }

  .digital-rfp-number {
    justify-self: stretch;
  }

  .digital-rfp-detail-grid,
  .digital-rfp-document-list {
    grid-template-columns: 1fr;
  }

  .digital-rfp-approval-flow {
    grid-template-columns: 1fr;
  }

  .digital-rfp-arrow {
    display: none;
  }

  .digital-rfp-two-column .digital-rfp-section {
    margin-left: 1rem !important;
    margin-right: 1rem !important;
  }
}

@media print {
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  body {
    background: #fff !important;
  }

  .digital-rfp-print-page {
    min-height: 0;
    background: #fff !important;
    padding: 0 !important;
  }

  .print-actions {
    display: none !important;
  }

  .digital-rfp-sheet {
    width: 100%;
    max-width: none;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
    font-size: 8pt;
    break-inside: avoid;
  }

  .digital-rfp-section {
    break-inside: avoid;
  }
}
''',
)


# -----------------------------------------------------------------------------
# Finance stage workflow service. Administrators are the Finance Head gate;
# finance_reviewer accounts are Finance members. This avoids a database enum
# migration while preserving all existing account roles and workflows.
# -----------------------------------------------------------------------------
write(
    'server/services/finance-stage-workflow.ts',
    r'''import { administrativeRoles } from '../domain/access.js';
import { HttpError } from '../lib/http.js';
import { adminClient } from '../lib/supabase.js';

type DatabaseClient = ReturnType<typeof adminClient>;
type RequestRow = Record<string, unknown>;

type FinanceStageInput = {
  requestId: string;
  action: string;
  remarks: string;
};

type FinanceActor = {
  email: string;
  userId: string;
  roles: string[];
};

const stageActions = new Set([
  'member_approve',
  'member_reject',
  'request_documents',
  'head_approve',
  'head_reject',
  'hard_copy_approve',
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (value: unknown) => String(value ?? '').trim();

const uniqueEmails = (emails: (string | null | undefined)[]) => [
  ...new Set(emails.map((email) => email?.trim().toLowerCase()).filter(Boolean) as string[]),
];

export function isFinanceStageAction(action: string) {
  return stageActions.has(action);
}

function isFinanceHead(roles: string[]) {
  return roles.some((role) => administrativeRoles.includes(role));
}

async function emailsForRoles(db: DatabaseClient, roles: string[]) {
  const roleRows = await db.from('user_roles').select('user_id').in('role', roles);
  if (roleRows.error) throw roleRows.error;
  const userIds = [...new Set((roleRows.data || []).map((row) => row.user_id))];
  if (!userIds.length) return [];
  const profiles = await db
    .from('profiles')
    .select('id,email,active')
    .in('id', userIds)
    .eq('active', true);
  if (profiles.error) throw profiles.error;
  return uniqueEmails((profiles.data || []).map((profile) => profile.email));
}

async function departmentHeadEmails(db: DatabaseClient, request: RequestRow) {
  const normalizedDepartment = asText(request.normalized_department);
  const assignments = normalizedDepartment
    ? await db
        .from('department_approving_heads')
        .select('user_id')
        .eq('normalized_department', normalizedDepartment)
    : { data: [], error: null };
  if (assignments.error) throw assignments.error;
  const userIds = [...new Set((assignments.data || []).map((row) => row.user_id))];
  const profiles = userIds.length
    ? await db.from('profiles').select('id,email,active').in('id', userIds).eq('active', true)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const emails = uniqueEmails((profiles.data || []).map((profile) => profile.email));
  if (emails.length) return emails;
  return uniqueEmails([asText(request.approver_email)]);
}

async function queueNotifications(
  db: DatabaseClient,
  request: RequestRow,
  recipients: string[],
  templateKey: string,
  subject: string,
  payload: Record<string, unknown>,
  version: number,
) {
  const emails = uniqueEmails(recipients);
  if (!emails.length) return;
  const requestId = asText(request.id);
  const rows = emails.map((email) => ({
    request_id: requestId,
    template_key: templateKey,
    recipient_email: email,
    subject,
    payload,
    deduplication_key: `${requestId}:${templateKey}:${version}:${email}`,
  }));
  const result = await db
    .from('email_notifications')
    .upsert(rows, { onConflict: 'deduplication_key', ignoreDuplicates: true });
  if (result.error) throw result.error;
}

function requireRemarks(remarks: string, label: string) {
  if (!remarks.trim()) throw new HttpError(400, `${label} requires a reason or remarks.`);
}

function requireStatus(currentStatus: string, allowed: string[], label: string) {
  if (!allowed.includes(currentStatus))
    throw new HttpError(409, `${label} is not available from ${currentStatus}.`);
}

export async function performFinanceStageAction(
  db: DatabaseClient,
  input: FinanceStageInput,
  actor: FinanceActor,
) {
  const current = await db.from('rfp_requests').select('*').eq('id', input.requestId).single();
  if (current.error || !current.data) throw new HttpError(404, 'Request not found.');
  const request = current.data as RequestRow;
  const currentStatus = asText(request.final_status);
  const raw = asRecord(request.raw_record);
  const workflow = asRecord(raw.finance_workflow);
  const financeOperations = asRecord(raw.finance_operations);
  const now = new Date();
  const nowIso = now.toISOString();
  const nextWorkflow: Record<string, unknown> = { ...workflow };
  const updateFields: Record<string, unknown> = {};
  const version = Number(request.version || 1);
  const nextVersion = version + 1;
  let nextStatus = currentStatus;
  let actionLabel = '';

  switch (input.action) {
    case 'member_approve':
      requireStatus(
        currentStatus,
        ['Pending Finance Review', 'Documentation Required'],
        'Finance member approval',
      );
      nextStatus = 'Pending Finance Head Review';
      actionLabel = 'Finance Member Approved';
      nextWorkflow.member_status = 'Approved';
      nextWorkflow.member_reviewed_at = nowIso;
      nextWorkflow.member_reviewed_by = actor.email;
      updateFields.finance_review = 'Member Approved';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_reviewed_by = actor.userId;
      updateFields.finance_remarks = input.remarks.trim() || request.finance_remarks || null;
      break;

    case 'member_reject':
      requireStatus(
        currentStatus,
        ['Pending Finance Review', 'Documentation Required'],
        'Finance member return',
      );
      requireRemarks(input.remarks, 'Returning a request to the Department Head');
      nextStatus = 'Returned to Department Approver';
      actionLabel = 'Finance Member Returned';
      nextWorkflow.member_status = 'Returned';
      nextWorkflow.member_reviewed_at = nowIso;
      nextWorkflow.member_reviewed_by = actor.email;
      updateFields.finance_review = 'Returned';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_reviewed_by = actor.userId;
      updateFields.finance_remarks = input.remarks.trim();
      break;

    case 'request_documents':
      requireStatus(
        currentStatus,
        ['Pending Finance Review', 'Documentation Required'],
        'Document request',
      );
      requireRemarks(input.remarks, 'Requesting documents');
      nextStatus = 'Documentation Required';
      actionLabel = 'Documentation Required';
      nextWorkflow.member_status = 'Documentation Required';
      nextWorkflow.member_reviewed_at = nowIso;
      nextWorkflow.member_reviewed_by = actor.email;
      updateFields.finance_review = 'Documentation Required';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_reviewed_by = actor.userId;
      updateFields.finance_remarks = input.remarks.trim();
      break;

    case 'head_approve':
      if (!isFinanceHead(actor.roles))
        throw new HttpError(403, 'Only a Finance Head / Administrator can approve this stage.');
      requireStatus(currentStatus, ['Pending Finance Head Review'], 'Finance Head approval');
      nextStatus = 'Awaiting Hard Copy Verification';
      actionLabel = 'Finance Head Approved';
      nextWorkflow.head_status = 'Approved';
      nextWorkflow.head_reviewed_at = nowIso;
      nextWorkflow.head_reviewed_by = actor.email;
      updateFields.finance_review = 'Head Approved';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_remarks = input.remarks.trim() || request.finance_remarks || null;
      break;

    case 'head_reject':
      if (!isFinanceHead(actor.roles))
        throw new HttpError(403, 'Only a Finance Head / Administrator can decline this stage.');
      requireStatus(currentStatus, ['Pending Finance Head Review'], 'Finance Head decline');
      requireRemarks(input.remarks, 'Finance Head decline');
      nextStatus = 'Returned to Requestor';
      actionLabel = 'Finance Head Declined';
      nextWorkflow.head_status = 'Declined';
      nextWorkflow.head_reviewed_at = nowIso;
      nextWorkflow.head_reviewed_by = actor.email;
      updateFields.finance_review = 'Head Declined';
      updateFields.finance_review_at = nowIso;
      updateFields.finance_remarks = input.remarks.trim();
      break;

    case 'hard_copy_approve': {
      requireStatus(currentStatus, ['Awaiting Hard Copy Verification'], 'Hard-copy approval');
      if (
        financeOperations.document_verification !== 'Complete' ||
        !asText(financeOperations.originals_received_date)
      ) {
        throw new HttpError(
          409,
          'Record the hard-copy received date and mark document verification Complete before approval.',
        );
      }
      const dueAt = new Date(now.getTime() + 3 * 24 * 60 * 60_000);
      nextStatus = 'Processing';
      actionLabel = 'Hard Copy Approved · Processing Started';
      nextWorkflow.hard_copy_status = 'Approved';
      nextWorkflow.hard_copy_approved_at = nowIso;
      nextWorkflow.hard_copy_approved_by = actor.email;
      nextWorkflow.processing_started_at = nowIso;
      nextWorkflow.processing_due_at = dueAt.toISOString();
      updateFields.finance_review = 'Approved';
      updateFields.finance_review_at = nowIso;
      updateFields.planned_check_date = dueAt.toISOString().slice(0, 10);
      break;
    }

    default:
      throw new HttpError(400, 'Unsupported Finance stage action.');
  }

  nextWorkflow.updated_at = nowIso;
  nextWorkflow.updated_by = actor.email;
  const updated = await db
    .from('rfp_requests')
    .update({
      ...updateFields,
      raw_record: { ...raw, finance_workflow: nextWorkflow },
      final_status: nextStatus,
      last_action: actionLabel,
      version: nextVersion,
    })
    .eq('id', input.requestId)
    .eq('version', version)
    .select('*')
    .single();
  if (updated.error || !updated.data) {
    throw new HttpError(
      409,
      updated.error?.message || 'This request changed. Refresh and try the action again.',
    );
  }

  const log = await db.from('approval_logs').insert({
    request_id: input.requestId,
    rfp_number: asText(request.rfp_number),
    action: actionLabel,
    actor_email: actor.email.toLowerCase(),
    actor_user_id: actor.userId,
    remarks: input.remarks.trim() || null,
    previous_status: currentStatus,
    new_status: nextStatus,
  });
  if (log.error) throw log.error;

  const rfpNumber = asText(request.rfp_number);
  if (input.action === 'member_approve') {
    const heads = await emailsForRoles(db, administrativeRoles);
    await queueNotifications(
      db,
      request,
      heads,
      'finance_head_review_required',
      `Finance Head review required: ${rfpNumber}`,
      { remarks: input.remarks.trim() || null },
      nextVersion,
    );
  } else if (input.action === 'member_reject') {
    const heads = await departmentHeadEmails(db, request);
    await queueNotifications(
      db,
      request,
      heads,
      'finance_returned',
      `${rfpNumber} returned to Department Head`,
      { remarks: input.remarks.trim() },
      nextVersion,
    );
  } else if (input.action === 'request_documents') {
    const recipients = [
      ...(await departmentHeadEmails(db, request)),
      asText(request.requestor_email),
    ];
    await queueNotifications(
      db,
      request,
      recipients,
      'documentation_required',
      `${rfpNumber} needs supporting documents`,
      { remarks: input.remarks.trim() },
      nextVersion,
    );
  } else if (input.action === 'head_approve') {
    const financeMembers = await emailsForRoles(db, ['finance_reviewer']);
    await queueNotifications(
      db,
      request,
      financeMembers,
      'hard_copy_verification_required',
      `Hard-copy verification required: ${rfpNumber}`,
      { remarks: input.remarks.trim() || null },
      nextVersion,
    );
  } else if (input.action === 'head_reject') {
    await queueNotifications(
      db,
      request,
      [asText(request.requestor_email)],
      'finance_head_rejected',
      `${rfpNumber} declined by Finance Head`,
      { remarks: input.remarks.trim() },
      nextVersion,
    );
  } else if (input.action === 'hard_copy_approve') {
    const dueAt = asText(nextWorkflow.processing_due_at);
    const recipients = [
      asText(request.requestor_email),
      ...(await departmentHeadEmails(db, request)),
    ];
    await queueNotifications(
      db,
      request,
      recipients,
      'processing_started',
      `${rfpNumber} is processing`,
      {
        processingDueAt: dueAt,
        plannedCheckDate: dueAt ? dueAt.slice(0, 10) : null,
        remarks: input.remarks.trim() || null,
      },
      nextVersion,
    );
  }

  return updated.data;
}
''',
)


# -----------------------------------------------------------------------------
# Validation: optional checklist + staged Finance actions.
# -----------------------------------------------------------------------------
replace_once(
    'server/lib/validation.ts',
    "  approvingHead: z.string().trim().min(2).max(160),\n});",
    "  approvingHead: z.string().trim().min(2).max(160),\n  attachmentChecklist: z.array(z.string().trim().min(1).max(180)).max(40).default([]),\n});",
)
replace_once(
    'server/lib/validation.ts',
    "    'approve',\n    'reject',\n    'request_documents',",
    "    'approve',\n    'reject',\n    'member_approve',\n    'member_reject',\n    'head_approve',\n    'head_reject',\n    'hard_copy_approve',\n    'request_documents',",
)


# -----------------------------------------------------------------------------
# Public submission: save advisory checklist and expose a safe digital receipt.
# -----------------------------------------------------------------------------
replace_once(
    'server/routes/public.ts',
    "    const companyUpdate = await db\n      .from('rfp_requests')\n      .update({ company: input.request.company })\n      .eq('id', started.data.requestId);\n    if (companyUpdate.error) throw companyUpdate.error;",
    "    const existingRequest = await db\n      .from('rfp_requests')\n      .select('raw_record')\n      .eq('id', started.data.requestId)\n      .single();\n    if (existingRequest.error) throw existingRequest.error;\n    const existingRaw =\n      existingRequest.data.raw_record &&\n      typeof existingRequest.data.raw_record === 'object' &&\n      !Array.isArray(existingRequest.data.raw_record)\n        ? (existingRequest.data.raw_record as Record<string, unknown>)\n        : {};\n    const companyUpdate = await db\n      .from('rfp_requests')\n      .update({\n        company: input.request.company,\n        raw_record: {\n          ...existingRaw,\n          submission_checklist: input.request.attachmentChecklist || [],\n        },\n      })\n      .eq('id', started.data.requestId);\n    if (companyUpdate.error) throw companyUpdate.error;",
)
replace_once(
    'server/routes/public.ts',
    "        'id,rfp_number,submitted_at,requestor_name,company,department,amount,required_payment_date,department_approval,finance_review,final_status,last_action,planned_check_date',",
    "        'id,rfp_number,submitted_at,requestor_name,company,department,project_class,rfp_type,supplier_payee,purpose_description,amount,required_payment_date,approving_head,department_approval,department_approval_at,finance_review,finance_review_at,final_status,last_action,planned_check_date,raw_record',",
)
replace_once(
    'server/routes/public.ts',
    "    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');\n    const [logs, attachments] = await Promise.all([",
    "    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');\n    const rawRecord =\n      request.data.raw_record &&\n      typeof request.data.raw_record === 'object' &&\n      !Array.isArray(request.data.raw_record)\n        ? (request.data.raw_record as Record<string, unknown>)\n        : {};\n    const workflow =\n      rawRecord.finance_workflow &&\n      typeof rawRecord.finance_workflow === 'object' &&\n      !Array.isArray(rawRecord.finance_workflow)\n        ? (rawRecord.finance_workflow as Record<string, unknown>)\n        : {};\n    const financeOperations =\n      rawRecord.finance_operations &&\n      typeof rawRecord.finance_operations === 'object' &&\n      !Array.isArray(rawRecord.finance_operations)\n        ? (rawRecord.finance_operations as Record<string, unknown>)\n        : {};\n    const submissionChecklist = Array.isArray(rawRecord.submission_checklist)\n      ? rawRecord.submission_checklist.filter((item): item is string => typeof item === 'string')\n      : [];\n    const [logs, attachments] = await Promise.all([",
)
replace_once(
    'server/routes/public.ts',
    "      request: request.data,\n      logs: logs.data || [],\n      attachments: attachments.data || [],",
    "      request: { ...request.data, raw_record: undefined },\n      workflow,\n      financeOperations,\n      submissionChecklist,\n      logs: logs.data || [],\n      attachments: attachments.data || [],",
)


# -----------------------------------------------------------------------------
# Staff API: finance-only printable receipt + staged Finance workflow.
# -----------------------------------------------------------------------------
replace_once(
    'server/routes/staff.ts',
    "import { auditTrailRow } from '../services/audit-trail.js';\nimport type { RouteHandler } from './context.js';",
    "import { auditTrailRow } from '../services/audit-trail.js';\nimport { isFinanceStageAction, performFinanceStageAction } from '../services/finance-stage-workflow.js';\nimport type { RouteHandler } from './context.js';",
)
replace_once(
    'server/routes/staff.ts',
    "  if (route === 'audit-trail') {",
    "  if (route.startsWith('digital-rfp/')) {\n    ensureMethod(event, 'GET');\n    await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);\n    const requestId = z.uuid().parse(route.slice('digital-rfp/'.length));\n    const [request, attachments] = await Promise.all([\n      db.from('rfp_requests').select('*').eq('id', requestId).single(),\n      db\n        .from('request_attachments')\n        .select('id,original_filename,status')\n        .eq('request_id', requestId)\n        .eq('status', 'available')\n        .order('created_at'),\n    ]);\n    if (request.error || !request.data) throw new HttpError(404, 'Request not found.');\n    if (attachments.error) throw attachments.error;\n    return json(200, { ok: true, request: request.data, attachments: attachments.data || [] });\n  }\n\n  if (route === 'audit-trail') {",
)
replace_regex(
    'server/routes/staff.ts',
    r"  if \(route === 'finance/action'\) \{.*?\n  \}\n\n  if \(route === 'finance/update'\) \{",
    r'''  if (route === 'finance/action') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, [...administrativeRoles, 'finance_reviewer']);
    const input = financeSchema.parse(readJson(event));
    const normalizedAction =
      input.action === 'approve'
        ? 'member_approve'
        : input.action === 'reject'
          ? 'member_reject'
          : input.action;

    if (isFinanceStageAction(normalizedAction)) {
      const request = await performFinanceStageAction(
        db,
        {
          requestId: input.requestId,
          action: normalizedAction,
          remarks: input.remarks,
        },
        {
          email: staff.user.email || '',
          userId: staff.user.id,
          roles: staff.roles,
        },
      );
      const delivery = await flushEmailQueueForRequest(input.requestId);
      return json(200, { ok: true, request, delivery });
    }

    const result = await db.rpc('finance_workflow_action', {
      p_request_id: input.requestId,
      p_action: input.action,
      p_remarks: input.remarks,
      p_actor_email: staff.user.email,
      p_actor_user_id: staff.user.id,
      p_planned_check_date: input.plannedCheckDate || null,
      p_change_reason: input.changeReason || null,
    });
    if (result.error) throw new HttpError(409, result.error.message);
    const delivery = await flushEmailQueueForRequest(input.requestId);
    return json(200, { ok: true, request: result.data, delivery });
  }

  if (route === 'finance/update') {''',
)
replace_regex(
    'server/routes/staff.ts',
    r"    const isCashAdvance = /cash advance/i\.test\(String\(request\.rfp_type \|\| ''\)\);\n    const operations = \{.*?\n    if \(\n      !isCashAdvance &&\n      operations\.document_verification === 'Incomplete' &&\n      !String\(operations\.verification_remarks \|\| ''\)\.trim\(\)\n    \) \{\n      throw new HttpError\(400, 'Describe the missing or incomplete documents\.'\);\n    \}",
    r'''    const operations = {
      ...existingOperations,
      originals_received_date: input.originalsReceivedDate || null,
      document_verification: input.documentVerification || null,
      verification_remarks: input.verificationRemarks || null,
      updated_at: new Date().toISOString(),
      updated_by: staff.user.email,
    };
    if (operations.document_verification === 'Complete' && !operations.originals_received_date) {
      throw new HttpError(
        400,
        'Record the original documents received date before marking them complete.',
      );
    }
    if (
      operations.document_verification === 'Incomplete' &&
      !String(operations.verification_remarks || '').trim()
    ) {
      throw new HttpError(400, 'Describe the missing or incomplete documents.');
    }''',
)


# -----------------------------------------------------------------------------
# Email templates: digital receipt + member/head/hard-copy notifications.
# -----------------------------------------------------------------------------
replace_once(
    'server/email/templates.ts',
    "  'finance_review_required',\n  'processing_started',",
    "  'finance_review_required',\n  'finance_head_review_required',\n  'finance_head_rejected',\n  'hard_copy_verification_required',\n  'processing_started',",
)
replace_once(
    'server/email/templates.ts',
    "const summary = (request: RequestRecord) =>\n  `<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" style=\"margin:22px 0;border-collapse:collapse;background:#f8fafc;border:1px solid #e4e9ef;border-radius:8px\">${row('RFP number', request.rfp_number)}${row('Requestor', request.requestor_name)}${row('Company', request.company || 'Not recorded')}${row('Department', request.department)}${row('Supplier / Payee', request.supplier_payee)}${row('Amount', money(request.amount))}${row('Required payment date', request.required_payment_date)}</table>`;",
    "const summary = (request: RequestRecord) =>\n  `<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" style=\"margin:22px 0;border-collapse:collapse;background:#f8fafc;border:1px solid #e4e9ef;border-radius:8px\">${row('RFP number', request.rfp_number)}${row('Requestor', request.requestor_name)}${row('Company', request.company || 'Not recorded')}${row('Department', request.department)}${row('Supplier / Payee', request.supplier_payee)}${row('Amount', money(request.amount))}${row('Required payment date', request.required_payment_date)}</table>`;\nconst companyLogoPath = (request: RequestRecord) =>\n  /greenmetal|gemcor/i.test(String(request.company || ''))\n    ? '/brands/gemcor.png'\n    : '/brands/greenlight-power.png';\nconst digitalReceipt = (request: RequestRecord, siteUrl: string) =>\n  `<div style=\"margin:22px 0;border:1px solid #cbd5df;border-radius:10px;overflow:hidden\"><div style=\"padding:14px 16px;background:#f7f9fb;border-bottom:1px solid #dce3ea\"><img src=\"${escape(`${siteUrl}${companyLogoPath(request)}`)}\" alt=\"${escape(request.company || 'Company')}\" style=\"display:block;max-width:170px;max-height:55px;object-fit:contain\"><div style=\"margin-top:10px;font-size:17px;font-weight:800;color:#153b59\">REQUEST FOR PAYMENT (RFP)</div><div style=\"font-size:12px;color:#667085\">Digital RFP – System Generated · ${escape(request.rfp_number)}</div></div><div style=\"padding:0 16px 4px\">${summary(request)}${row('Type', request.rfp_type || '—')}${row('Project / Cost Center', request.project_class || '—')}${row('Purpose', request.purpose_description || '—')}</div></div>`;",
)
replace_regex(
    'server/email/templates.ts',
    r"  if \(template === 'department_approved'\)\n    return \{.*?\n    \};\n  if \(template === 'department_rejected'\)",
    r'''  if (template === 'department_approved')
    return {
      subject: `${request.rfp_number} approved by department`,
      html: shell(
        `${rfp} approved by Department Head`,
        `<p>Your Department Head approved this request. Finance members have been notified and your digital RFP receipt is below.</p>${digitalReceipt(request, siteUrl)}${remarks}`,
      ),
    };
  if (template === 'department_rejected')''',
)
replace_regex(
    'server/email/templates.ts',
    r"  if \(template === 'finance_review_required'\)\n    return \{.*?\n    \};\n  if \(template === 'processing_started'\)",
    r'''  if (template === 'finance_review_required')
    return {
      subject: `Finance member review required: ${request.rfp_number}`,
      html: shell(
        `Finance member review — ${rfp}`,
        `<p>Department approval is complete. At least one Finance member must approve before the request is sent to the Finance Head.</p>${digitalReceipt(request, siteUrl)}<p style="margin-top:24px">${button('Open Finance approvals', `${siteUrl}/admin/approvals`, '#315c93')}</p>`,
      ),
    };
  if (template === 'finance_head_review_required')
    return {
      subject: `Finance Head review required: ${request.rfp_number}`,
      html: shell(
        `Finance Head approval — ${rfp}`,
        `<p>A Finance member approved this request. A Finance Head / Administrator must now approve or decline it.</p>${digitalReceipt(request, siteUrl)}${remarks}<p style="margin-top:24px">${button('Open Finance approvals', `${siteUrl}/admin/approvals`, '#315c93')}</p>`,
      ),
    };
  if (template === 'finance_head_rejected')
    return {
      subject: `${request.rfp_number} declined by Finance Head`,
      html: shell(
        `${rfp} declined by Finance Head`,
        `<p>The Finance Head declined this request and returned it directly to you.</p>${digitalReceipt(request, siteUrl)}${remarks}`,
      ),
    };
  if (template === 'hard_copy_verification_required')
    return {
      subject: `Hard-copy verification required: ${request.rfp_number}`,
      html: shell(
        `Hard-copy verification — ${rfp}`,
        `<p>The Finance Head approved this request. Finance must receive and manually verify the hard-copy documents in the website before actual processing can start.</p>${digitalReceipt(request, siteUrl)}${remarks}<p style="margin-top:24px">${button('Open Finance approvals', `${siteUrl}/admin/approvals`, '#315c93')}</p>`,
      ),
    };
  if (template === 'processing_started')''',
)
replace_once(
    'server/email/templates.ts',
    "        `<p>Finance approved this request and processing has started.</p>${summary(request)}<div style=\"margin:20px 0;padding:14px 16px;background:#edf8f2;border-radius:8px\"><strong>Target release date:</strong> ${escape(payload.plannedCheckDate || 'To be confirmed')}</div>${remarks}`,
",
    "        `<p>Hard-copy verification is approved and the 3-day Finance processing clock has started.</p>${digitalReceipt(request, siteUrl)}<div style=\"margin:20px 0;padding:14px 16px;background:#edf8f2;border-radius:8px\"><strong>3-day processing deadline:</strong> ${escape(payload.processingDueAt || payload.plannedCheckDate || 'To be confirmed')}</div>${remarks}`,
",
)


# -----------------------------------------------------------------------------
# Request form: advisory checklist + clearer optional attachment reminder.
# -----------------------------------------------------------------------------
replace_once(
    'src/pages/RequestPage.tsx',
    "import { FileDropzone } from '../components/FileDropzone';",
    "import { FileDropzone } from '../components/FileDropzone';\nimport { RequestAttachmentChecklist } from '../components/RequestAttachmentChecklist';",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "  const [files, setFiles] = useState<File[]>([]);",
    "  const [files, setFiles] = useState<File[]>([]);\n  const [attachmentChecklist, setAttachmentChecklist] = useState<string[]>([]);",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "        request: { ...form, amount: Number(form.amount) },",
    "        request: {\n          ...form,\n          amount: Number(form.amount),\n          attachmentChecklist,\n        },",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "      setForm(initial);\n      setFiles([]);",
    "      setForm(initial);\n      setFiles([]);\n      setAttachmentChecklist([]);",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "            Complete the request details and attach supporting images or PDF documents.",
    "            Complete the request details. Supporting files are strongly recommended, but uploads remain optional at submission.",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "              onChange={(v) => update('rfpType', v)}\n            />",
    "              onChange={(v) => {\n                update('rfpType', v);\n                setAttachmentChecklist([]);\n              }}\n            />",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "            <div className=\"md:col-span-2\">\n              <FileDropzone",
    "            <RequestAttachmentChecklist\n              rfpType={form.rfpType}\n              selected={attachmentChecklist}\n              onChange={setAttachmentChecklist}\n            />\n            <div className=\"md:col-span-2\">\n              <div className=\"mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900\">\n                <strong>Attachment reminder:</strong> Upload supporting documents when available. Files are not mandatory to submit because the system cannot reliably determine each document type, but missing support may cause the request to be returned during approval.\n              </div>\n              <FileDropzone",
)


# -----------------------------------------------------------------------------
# Shared request type: include workflow state stored in raw_record.
# -----------------------------------------------------------------------------
replace_once(
    'src/types/index.ts',
    "    finance_operations?: {",
    "    submission_checklist?: string[];\n    finance_workflow?: {\n      member_status?: string | null;\n      member_reviewed_at?: string | null;\n      member_reviewed_by?: string | null;\n      head_status?: string | null;\n      head_reviewed_at?: string | null;\n      head_reviewed_by?: string | null;\n      hard_copy_status?: string | null;\n      hard_copy_approved_at?: string | null;\n      hard_copy_approved_by?: string | null;\n      processing_started_at?: string | null;\n      processing_due_at?: string | null;\n      updated_at?: string | null;\n      updated_by?: string | null;\n    };\n    finance_operations?: {",
)


# -----------------------------------------------------------------------------
# Finance Dashboard: new stage hierarchy, 3-day SLA and Finance-only print.
# -----------------------------------------------------------------------------
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "  RefreshCw,\n  Search,",
    "  Printer,\n  RefreshCw,\n  Search,",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "type QueueFocus = 'all' | 'originals' | 'due' | 'review' | 'signatory' | 'release';",
    "type QueueFocus = 'all' | 'member' | 'head' | 'hardcopy' | 'processing' | 'overdue';",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "const requiresOriginals = (request: RfpRequest) => !/cash advance/i.test(request.rfp_type);\n\nconst awaitingOriginals = (request: RfpRequest) =>\n  requiresOriginals(request) &&\n  request.department_approval === 'Approved' &&\n  !financeOperations(request).originals_received_date &&\n  !/paid|rejected|returned to requestor/i.test(request.final_status);",
    "const requiresOriginals = (_request: RfpRequest) => true;\n\nconst financeWorkflow = (request: RfpRequest) => request.raw_record?.finance_workflow || {};\n\nconst processingOverdue = (request: RfpRequest, now: number) => {\n  const dueAt = financeWorkflow(request).processing_due_at;\n  return Boolean(\n    dueAt &&\n      new Date(dueAt).getTime() < now &&\n      !/paid|returned to requestor/i.test(request.final_status),\n  );\n};\n\nconst displayStatus = (request: RfpRequest, now: number) =>\n  processingOverdue(request, now) ? 'Overdue' : request.final_status;\n\nconst awaitingOriginals = (request: RfpRequest) =>\n  request.final_status === 'Awaiting Hard Copy Verification' &&\n  (financeOperations(request).document_verification !== 'Complete' ||\n    !financeOperations(request).originals_received_date);",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "function getSlaInfo(request: RfpRequest, now: number): SlaInfo {\n  const status = request.final_status;",
    "function getSlaInfo(request: RfpRequest, now: number): SlaInfo {\n  const status = request.final_status;\n  const processingDue = financeWorkflow(request).processing_due_at;\n  if (processingDue && !/paid|returned to requestor/i.test(status)) {\n    const difference = new Date(processingDue).getTime() - now;\n    if (difference < 0) {\n      const overdueHours = Math.max(1, Math.ceil(Math.abs(difference) / 36e5));\n      return {\n        label: `${overdueHours}h overdue`,\n        detail: `3-day processing deadline was ${manilaDate(processingDue, true)}`,\n        tone: 'danger',\n      };\n    }\n    const hours = Math.max(1, Math.ceil(difference / 36e5));\n    return {\n      label: `${hours}h left in 3-day process`,\n      detail: `Processing deadline ${manilaDate(processingDue, true)}`,\n      tone: hours <= 24 ? 'warning' : 'good',\n    };\n  }",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "  if (['Pending Finance Review', 'Documentation Required'].includes(status)) {",
    "  if (status === 'Pending Finance Head Review') {\n    return {\n      label: 'Finance Head decision',\n      detail: 'At least one Finance member has approved',\n      tone: 'warning',\n    };\n  }\n  if (status === 'Awaiting Hard Copy Verification') {\n    return {\n      label: 'Hard-copy gate',\n      detail: 'Manual document verification is required before processing',\n      tone: 'warning',\n    };\n  }\n  if (['Pending Finance Review', 'Documentation Required'].includes(status)) {",
)
replace_regex(
    'src/pages/ApprovalsPage.tsx',
    r"const financeActionOptions = \(status: string\): Action\[\] => \{.*?\n\};",
    r'''const financeActionOptions = (status: string, financeHead: boolean): Action[] => {
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
};''',
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "  const department = roles.some((role) =>\n    ['super_administrator', 'administrator', 'department_approver'].includes(role),\n  );",
    "  const financeHead = roles.some((role) =>\n    ['super_administrator', 'administrator'].includes(role),\n  );\n  const department = roles.some((role) =>\n    ['super_administrator', 'administrator', 'department_approver'].includes(role),\n  );",
)
replace_regex(
    'src/pages/ApprovalsPage.tsx',
    r"  const matchesQueueFocus = useCallback\(\n    \(request: RfpRequest\) => \{.*?\n    \[now, queueFocus\],\n  \);",
    r'''  const matchesQueueFocus = useCallback(
    (request: RfpRequest) => {
      if (queueFocus === 'all') return true;
      if (queueFocus === 'member')
        return ['Pending Finance Review', 'Documentation Required'].includes(request.final_status);
      if (queueFocus === 'head') return request.final_status === 'Pending Finance Head Review';
      if (queueFocus === 'hardcopy') return request.final_status === 'Awaiting Hard Copy Verification';
      if (queueFocus === 'processing')
        return (
          ['Processing', 'Check Preparation', 'Check Approval', 'Awaiting Signatory'].includes(
            request.final_status,
          ) && !processingOverdue(request, now)
        );
      return processingOverdue(request, now);
    },
    [now, queueFocus],
  );''',
)
replace_regex(
    'src/pages/ApprovalsPage.tsx',
    r"  const queueCounts = useMemo\(\(\) => \{.*?\n  \}, \[now, rows\]\);",
    r'''  const queueCounts = useMemo(() => {
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
  }, [now, rows]);''',
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "        ? financeActionOptions(selected.final_status)\n        : []",
    "        ? financeActionOptions(selected.final_status, financeHead)\n        : []",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "  const needsTarget = ['approve', 'payment_processing'].includes(action);",
    "  const needsTarget = action === 'payment_processing';",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "    if (action === 'department_reject' && !remarks.trim()) {\n      setError('Remarks are required when returning a request to the Requestor.');\n      return;\n    }\n    if (\n      action === 'approve' &&\n      requiresOriginals(selected) &&\n      (financeOperations(selected).document_verification !== 'Complete' ||\n        !financeOperations(selected).originals_received_date)\n    ) {\n      setError('Save a complete original-document verification before Finance approval.');\n      return;\n    }",
    "    if (\n      ['department_reject', 'member_reject', 'head_reject', 'request_documents'].includes(action) &&\n      !remarks.trim()\n    ) {\n      setError('Remarks are required for return, decline, or document-request actions.');\n      return;\n    }\n    if (\n      action === 'hard_copy_approve' &&\n      (financeOperations(selected).document_verification !== 'Complete' ||\n        !financeOperations(selected).originals_received_date)\n    ) {\n      setError('Save a complete hard-copy verification before starting processing.');\n      return;\n    }",
)
replace_regex(
    'src/pages/ApprovalsPage.tsx',
    r"      \{finance && \(\n        <section className=\"queue-health-grid\" aria-label=\"Finance queue health\">.*?\n        </section>\n      \)\}",
    r'''      {finance && (
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
      )}''',
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "                    <StatusBadge>{request.final_status}</StatusBadge>",
    "                    <StatusBadge>{displayStatus(request, now)}</StatusBadge>",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "              <StatusBadge>{selected.final_status}</StatusBadge>",
    "              <StatusBadge>{displayStatus(selected, now)}</StatusBadge>",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "            <p>\n              {selected.company || 'Company not recorded'} · Submitted{' '}\n              {manilaDate(selected.submitted_at, true)}\n            </p>",
    "            <div className=\"flex flex-wrap items-center gap-2\">\n              <p>\n                {selected.company || 'Company not recorded'} · Submitted{' '}\n                {manilaDate(selected.submitted_at, true)}\n              </p>\n              {finance && (\n                <Button\n                  variant=\"secondary\"\n                  onClick={() =>\n                    window.open(`/admin/rfp/${selected.id}/print`, '_blank', 'noopener,noreferrer')\n                  }\n                >\n                  <Printer size={16} />\n                  Print digital RFP\n                </Button>\n              )}\n            </div>",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "              ['Finance review', selected.finance_review],\n              ['Finance remarks', selected.finance_remarks || '—'],",
    "              [\n                'Finance member review',\n                financeWorkflow(selected).member_status || selected.finance_review,\n              ],\n              ['Finance head review', financeWorkflow(selected).head_status || 'Pending'],\n              ['Hard-copy approval', financeWorkflow(selected).hard_copy_status || 'Pending'],\n              [\n                '3-day processing due',\n                manilaDate(financeWorkflow(selected).processing_due_at || null, true),\n              ],\n              ['Finance remarks', selected.finance_remarks || '—'],",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "              ['Current stage', selected.final_status],",
    "              ['Current stage', displayStatus(selected, now)],",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "                      requiresOriginals(selected)\n                        ? 'Required when documents are incomplete'\n                        : 'Hard-copy verification is not required for Cash Advances.'",
    "                      'Required when documents are incomplete'",
)
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "                  Regular RFPs require received originals and a complete verification before Finance\n                  approval. Cash Advances do not require hard copies.",
    "                  Every RFP must record received hard copies and a Complete verification after Finance Head approval. The 3-day processing clock starts only when a Finance member approves this hard-copy gate.",
)


# -----------------------------------------------------------------------------
# Requestor tracking: show the same digital receipt after Department approval.
# -----------------------------------------------------------------------------
replace_once(
    'src/pages/TrackPage.tsx',
    "import { Button, Spinner, StatusBadge } from '../components/ui';",
    "import { Button, Spinner, StatusBadge } from '../components/ui';\nimport { DigitalRfpReceipt } from '../components/DigitalRfpReceipt';",
)
replace_once(
    'src/pages/TrackPage.tsx',
    "    department: string;\n    amount: number;",
    "    department: string;\n    project_class: string;\n    rfp_type: string;\n    supplier_payee: string;\n    purpose_description: string;\n    approving_head: string;\n    department_approval_at: string | null;\n    amount: number;",
)
replace_once(
    'src/pages/TrackPage.tsx',
    "  logs: { occurred_at: string; action: string; remarks: string | null; new_status: string }[];",
    "  workflow: {\n    member_status?: string | null;\n    member_reviewed_at?: string | null;\n    member_reviewed_by?: string | null;\n    head_status?: string | null;\n    head_reviewed_at?: string | null;\n    head_reviewed_by?: string | null;\n    hard_copy_status?: string | null;\n    hard_copy_approved_at?: string | null;\n    hard_copy_approved_by?: string | null;\n    processing_started_at?: string | null;\n    processing_due_at?: string | null;\n  };\n  financeOperations: {\n    originals_received_date?: string | null;\n    document_verification?: string | null;\n    verification_remarks?: string | null;\n    updated_by?: string | null;\n  };\n  submissionChecklist: string[];\n  logs: { occurred_at: string; action: string; remarks: string | null; new_status: string }[];",
)
replace_once(
    'src/pages/TrackPage.tsx',
    "      </section>\n      {r.final_status === 'Returned to Requestor' && (",
    "      </section>\n      {r.department_approval === 'Approved' && (\n        <DigitalRfpReceipt\n          request={r}\n          attachments={data!.attachments}\n          workflow={data!.workflow}\n          financeOperations={data!.financeOperations}\n          submissionChecklist={data!.submissionChecklist}\n        />\n      )}\n      {r.final_status === 'Returned to Requestor' && (",
)


# -----------------------------------------------------------------------------
# App routing + print stylesheet.
# -----------------------------------------------------------------------------
replace_once(
    'src/App.tsx',
    "const DashboardPage = lazy(() =>\n  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),\n);",
    "const DashboardPage = lazy(() =>\n  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),\n);\nconst DigitalRfpPrintPage = lazy(() =>\n  import('./pages/DigitalRfpPrintPage').then((m) => ({ default: m.DigitalRfpPrintPage })),\n);",
)
replace_once(
    'src/App.tsx',
    "            <Route path=\"/admin/reset-password\" element={<PasswordResetPage />} />\n            <Route path=\"/admin\" element={<AdminLayout />}>",
    "            <Route path=\"/admin/reset-password\" element={<PasswordResetPage />} />\n            <Route path=\"/admin/rfp/:id/print\" element={<DigitalRfpPrintPage />} />\n            <Route path=\"/admin\" element={<AdminLayout />}>",
)
replace_once(
    'src/main.tsx',
    "import './styles/finance-refinement.css';",
    "import './styles/finance-refinement.css';\nimport './styles/digital-rfp.css';",
)

print('Workflow remap files prepared successfully.')
