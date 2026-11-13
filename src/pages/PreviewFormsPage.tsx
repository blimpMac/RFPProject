import { useMemo, useState } from 'react';
import { BookOpen, Eye, FileText, Mail, Printer, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { DigitalRfpReceipt, type DigitalRfpRequest } from '../components/DigitalRfpReceipt';
import { EmailPreviewPanel } from '../components/EmailPreviewPanel';
import type { RfLiquidation } from '../../shared/utils/rf-liquidation';

type FormType = 'rfp' | 'ca' | 'rf';
const sampleDate = '2026-11-13';
const sampleRequest: DigitalRfpRequest = {
  id: 'preview-only',
  rfp_number: 'SAMPLE-0000',
  submitted_at: '2026-11-13T09:00:00+08:00',
  requestor_name: 'Sample Employee',
  requestor_email: 'sample@example.invalid',
  company: 'Greenlight Power Inc.',
  department: 'Finance',
  project_class: 'Operations - sample',
  rfp_type: 'Supplier Payment',
  request_type: 'Regular',
  supplier_payee: 'Sample Supplier',
  purpose_description: 'Sample payment request for layout preview only. Not a real payment.',
  amount: 12500,
  required_payment_date: sampleDate,
  approving_head: 'Sample Department Head',
  department_approval: 'Pending',
  finance_review: 'Pending',
  final_status: 'Sample preview only',
};

const rfLiquidation: RfLiquidation = {
  custodianName: 'Sample Custodian',
  periodCovered: 'November 1-15, 2026',
  projectSof: 'SAMPLE-SOF',
  revolvingFundAmount: 20000,
  previousReplenishment: 0,
  cashOnHandAsOf: sampleDate,
  expenses: [
    {
      date: sampleDate,
      invoiceOrNo: 'SAMPLE-OR-001',
      name: 'Sample Supplier',
      itemDescription: 'Sample office supplies',
      account: 'Office Expenses',
      amount: 1500,
    },
  ],
  unliquidatedAdvances: [],
};

const choices: { id: FormType; name: string; detail: string }[] = [
  {
    id: 'rfp',
    name: 'Request for Payment',
    detail: 'Standard RFP form and supporting-document layout',
  },
  { id: 'ca', name: 'Cash Advance', detail: 'Cash advance request form preview' },
  { id: 'rf', name: 'RF Liquidation', detail: 'Revolving fund liquidation and expense sheet' },
];

export function PreviewFormsPage() {
  const { roles } = useAuth();
  const [selected, setSelected] = useState<FormType>('rfp');
  const [showEmail, setShowEmail] = useState(false);
  const isIT = roles.includes('it_administrator');
  const request = useMemo<DigitalRfpRequest>(
    () =>
      selected === 'rf'
        ? {
            ...sampleRequest,
            rfp_number: 'RF-SAMPLE-0000',
            rfp_type: 'RF Liquidation',
            supplier_payee: 'Revolving Fund',
            amount: 1500,
            purpose_description: 'Sample revolving fund liquidation - preview only.',
          }
        : selected === 'ca'
          ? {
              ...sampleRequest,
              rfp_number: 'CA-SAMPLE-0000',
              rfp_type: 'Cash Advance (CA)',
              supplier_payee: 'Sample Employee',
              purpose_description: 'Sample cash advance for site expenses - preview only.',
            }
          : sampleRequest,
    [selected],
  );

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <p className="eyebrow">Dedicated forms workspace</p>
        <h2 className="mt-2 flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
          <Eye size={26} /> Preview Forms
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          View blank-style sample forms in a separate workspace. Previews are demonstration records
          only and cannot approve, release, or change any payment.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/admin/manual" className="btn btn-secondary">
            <BookOpen size={16} /> Open user manual
          </Link>
          <Link to="/admin/new-request" className="btn btn-primary">
            Create a real request
          </Link>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Choose a form</h3>
            <p className="text-sm text-slate-500">
              The preview below stays inside this dedicated page, not inside approvals or account
              management.
            </p>
          </div>
          <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-900">
            Sample — not for payment
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {choices.map((choice) => (
            <button
              type="button"
              key={choice.id}
              onClick={() => {
                setSelected(choice.id);
                setShowEmail(false);
              }}
              aria-pressed={!showEmail && selected === choice.id}
              className={`rounded-xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${!showEmail && selected === choice.id ? 'border-[#315c93] bg-blue-50 shadow-sm dark:bg-slate-800' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
            >
              <FileText size={20} className="mb-2 text-[#315c93]" />
              <strong className="block text-sm">{choice.name}</strong>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{choice.detail}</span>
            </button>
          ))}
        </div>
        {isIT && (
          <button
            type="button"
            className={`btn mt-3 ${showEmail ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowEmail(true)}
          >
            <Mail size={16} /> Preview notification emails
          </button>
        )}
      </section>

      {showEmail && isIT ? (
        <EmailPreviewPanel />
      ) : (
        <section className="card overflow-hidden p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <h3 className="text-lg font-semibold">
                {choices.find((choice) => choice.id === selected)?.name} — sample form
              </h3>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck size={15} /> Fictional sample information only; no real request or
                approval is loaded.
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Printer size={16} /> Print preview
            </button>
          </div>
          <div className="relative mx-auto max-w-5xl overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-5 z-10 rounded border-2 border-red-400 bg-white/90 px-3 py-1 text-sm font-extrabold tracking-widest text-red-700"
            >
              SAMPLE ONLY
            </div>
            <DigitalRfpReceipt
              key={selected}
              request={request}
              attachments={[]}
              rfLiquidation={selected === 'rf' ? rfLiquidation : undefined}
            />
          </div>
        </section>
      )}
    </div>
  );
}
